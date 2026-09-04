import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp, Minus } from 'lucide-react'
import { ButtonHTMLAttributes, ChangeEvent, Children, ComponentProps, HTMLAttributes, InputHTMLAttributes, isValidElement, ReactElement, ReactNode, SelectHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

type ButtonVariant = 'default' | 'outline' | 'ghost' | 'danger'
type ButtonSize = 'default' | 'sm' | 'icon'

export function Button({ className, variant = 'default', size = 'default', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={cn('ui-button', `ui-button-${variant}`, `ui-button-${size}`, className)} {...props} />
}

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('ui-card surface-gradient', className)} {...props} />
}

export function Badge({ className, tone = 'neutral', ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  return <span className={cn('ui-badge', `ui-badge-${tone}`, className)} {...props} />
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('ui-input', className)} {...props} />
}

export function Select({ className, children, value, defaultValue, onChange, name, disabled, required, id, 'aria-label': ariaLabel }: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = Children.toArray(children).filter(isValidElement) as ReactElement<{ value?: string; disabled?: boolean; children?: ReactNode }>[]
  const placeholderOption = options.find(option => (option.props.value ?? '') === '')
  const items = options.filter(option => (option.props.value ?? String(option.props.children)) !== '')
  const change = (nextValue: string) => onChange?.({ target: { value: nextValue }, currentTarget: { value: nextValue } } as ChangeEvent<HTMLSelectElement>)
  return <SelectPrimitive.Root
    value={value == null ? undefined : String(value)}
    defaultValue={defaultValue == null || defaultValue === '' ? undefined : String(defaultValue)}
    onValueChange={change}
    name={name}
    disabled={disabled}
    required={required}
  >
    <SelectPrimitive.Trigger id={id} aria-label={ariaLabel} className={cn('ui-select', className)}>
      <SelectPrimitive.Value placeholder={placeholderOption?.props.children ?? 'Select…'} />
      <SelectPrimitive.Icon asChild><ChevronDown aria-hidden="true" /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content className="ui-select-content" position="popper" sideOffset={5}>
        <SelectPrimitive.ScrollUpButton className="ui-select-scroll"><ChevronUp /></SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="ui-select-viewport">
          {items.map((option, index) => {
            const itemValue = option.props.value ?? String(option.props.children)
            return <SelectPrimitive.Item className="ui-select-item" disabled={option.props.disabled} value={itemValue} key={`${itemValue}-${index}`}>
              <SelectPrimitive.ItemText>{option.props.children}</SelectPrimitive.ItemText>
              <SelectPrimitive.ItemIndicator className="ui-select-indicator"><Check aria-hidden="true" /></SelectPrimitive.ItemIndicator>
            </SelectPrimitive.Item>
          })}
        </SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="ui-select-scroll"><ChevronDown /></SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>
}

export function Dialog({ children, className, label, labelledBy, role = 'dialog', onClose }: { children: ReactNode; className?: string; label?: string; labelledBy?: string; role?: 'dialog' | 'alertdialog'; onClose: () => void }) {
  return <div className="ui-overlay" onMouseDown={onClose}>
    <section className={cn('ui-dialog', className)} role={role} aria-modal="true" aria-label={label} aria-labelledby={labelledBy} onMouseDown={event => event.stopPropagation()}>{children}</section>
  </div>
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="ui-empty"><div className="ui-empty-mark" aria-hidden="true">□</div><h3>{title}</h3><p>{description}</p>{action}</div>
}

export function DataTableFrame({ title, description, actions, filters, children, footer, className }: { title: string; description: string; actions?: ReactNode; filters?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string }) {
  return <Card className={cn('ui-data-table surface-gradient', className)}>
    <header className="ui-data-table-header"><div><h2>{title}</h2><p>{description}</p></div>{actions && <div className="ui-data-table-actions">{actions}</div>}</header>
    {filters && <div className="ui-data-table-filters">{filters}</div>}
    <div className="ui-data-table-scroll">{children}</div>
    {footer && <footer className="ui-data-table-footer">{footer}</footer>}
  </Card>
}

export function MetricCard({ label, value, hint, meter, className }: { label: string; value: ReactNode; hint?: ReactNode; meter?: number; className?: string }) {
  return <article className={cn('metric metric-gradient', className)}>
    <span>{label}</span>
    <strong>{value}</strong>
    {hint != null && hint !== false && <small>{hint}</small>}
    {meter != null && <div className="meter" aria-hidden="true"><i style={{ width: `${meter}%` }} /></div>}
  </article>
}

export function Checkbox({ className, checked, onCheckedChange, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return <CheckboxPrimitive.Root className={cn('ui-checkbox', className)} checked={checked} onCheckedChange={onCheckedChange} {...props}>
    <CheckboxPrimitive.Indicator className="ui-checkbox-indicator">
      {checked === 'indeterminate' ? <Minus /> : <Check />}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
}

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export function DropdownMenuContent({ className, align = 'end', sideOffset = 6, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content className={cn('ui-menu-content', className)} align={align} sideOffset={sideOffset} {...props} />
  </DropdownMenuPrimitive.Portal>
}
export function DropdownMenuItem({ className, danger, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Item> & { danger?: boolean }) {
  return <DropdownMenuPrimitive.Item className={cn('ui-menu-item', danger && 'ui-menu-item-danger', className)} {...props} />
}
export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator className={cn('ui-menu-separator', className)} {...props} />
}
export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return <DropdownMenuPrimitive.Label className={cn('ui-menu-label', className)} {...props} />
}

export const Collapsible = CollapsiblePrimitive.Root
export const CollapsibleTrigger = CollapsiblePrimitive.Trigger
export const CollapsibleContent = CollapsiblePrimitive.Content
