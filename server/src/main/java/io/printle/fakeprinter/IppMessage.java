package io.printle.fakeprinter;

import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Small, bounded IPP codec for the diagnostic printer. Document bytes are not logged. */
final class IppMessage {
    record Attribute(int group, int tag, String name, byte[] value) {
        Object decoded() {
            return switch (tag) {
                case 0x21, 0x23 -> value.length == 4 ? ByteBuffer.wrap(value).getInt() : "invalid integer";
                case 0x22 -> value.length == 1 && value[0] != 0;
                case 0x33 -> value.length == 8 ? List.of(ByteBuffer.wrap(value).getInt(), ByteBuffer.wrap(value).getInt(4)) : "invalid range";
                default -> new String(value, StandardCharsets.UTF_8);
            };
        }
    }

    final int code, id;
    final List<Attribute> attributes = new ArrayList<>();
    byte[] document = new byte[0];

    IppMessage(int code, int id) { this.code = code; this.id = id; }

    static IppMessage read(byte[] bytes) throws IOException {
        var in = new DataInputStream(new ByteArrayInputStream(bytes));
        int version = in.readUnsignedShort();
        if (version != 0x0101 && version != 0x0200) throw new IOException("Use IPP/1.1 or IPP/2.0");
        var message = new IppMessage(in.readUnsignedShort(), in.readInt());
        int group = 0;
        String name = null;
        while (true) {
            if (bytes.length - in.available() > 65536) throw new IOException("IPP attributes exceed 64 KB");
            int tag = in.readUnsignedByte();
            if (tag == 3) break;
            if (tag < 0x10) { group = tag; name = null; continue; }
            int length = in.readUnsignedShort();
            if (length > 0) name = new String(exact(in, length), StandardCharsets.UTF_8);
            if (group == 0 || name == null) throw new IOException("Missing IPP attribute group or name");
            byte[] value = exact(in, in.readUnsignedShort());
            if (message.attributes.size() >= 256) throw new IOException("Too many IPP attributes");
            if ((tag == 0x21 || tag == 0x23) && value.length != 4 || tag == 0x22 && value.length != 1)
                throw new IOException("Invalid IPP numeric attribute");
            message.attributes.add(new Attribute(group, tag, name, value));
        }
        message.document = in.readAllBytes();
        return message;
    }

    private static byte[] exact(DataInputStream in, int size) throws IOException {
        byte[] value = in.readNBytes(size);
        if (value.length != size) throw new EOFException("Truncated IPP attribute");
        return value;
    }

    String text(String name, String fallback) {
        return attributes.stream().filter(a -> a.name.equals(name)).findFirst()
            .map(a -> String.valueOf(a.decoded())).orElse(fallback);
    }

    int number(String name, int fallback) {
        return attributes.stream().filter(a -> a.name.equals(name) && a.decoded() instanceof Integer)
            .map(a -> (Integer) a.decoded()).findFirst().orElse(fallback);
    }

    IppMessage add(int group, int tag, String name, Object... values) {
        for (Object value : values) {
            byte[] raw = value instanceof byte[] b ? b : value instanceof Integer n ? ByteBuffer.allocate(4).putInt(n).array()
                : value instanceof Boolean b ? new byte[]{(byte) (b ? 1 : 0)} : value.toString().getBytes(StandardCharsets.UTF_8);
            attributes.add(new Attribute(group, tag, name, raw));
        }
        return this;
    }

    // Explicit group boundary permits multiple job-attributes groups in Get-Jobs.
    void boundary() { attributes.add(new Attribute(2, 0, "", new byte[0])); }

    byte[] bytes() throws IOException {
        var buffer = new ByteArrayOutputStream();
        var out = new DataOutputStream(buffer);
        out.writeShort(0x0101); out.writeShort(code); out.writeInt(id);
        int group = 0;
        String previous = null;
        for (var attribute : attributes) {
            if (attribute.tag == 0) { group = 0; previous = null; continue; }
            if (group != attribute.group) { group = attribute.group; out.writeByte(group); previous = null; }
            byte[] name = attribute.name.equals(previous) ? new byte[0] : attribute.name.getBytes(StandardCharsets.UTF_8);
            out.writeByte(attribute.tag); out.writeShort(name.length); out.write(name);
            out.writeShort(attribute.value.length); out.write(attribute.value);
            previous = attribute.name;
        }
        out.writeByte(3);
        return buffer.toByteArray();
    }

    List<Map<String, Object>> view() {
        return attributes.stream().filter(a -> a.tag != 0).map(a -> Map.<String, Object>of(
            "group", a.group, "tag", "0x%02x".formatted(a.tag), "name", a.name, "value", a.decoded())).toList();
    }
}
