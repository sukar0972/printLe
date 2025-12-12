
# 🖨️ PrintLe: Remote IPP Printing Application

PrintLe is a web application designed to remotely manage and send print jobs to a network IPP (Internet Printing Protocol) printer via an intermediary Node.js server. This allows for advanced print options like custom page ranges and manual double-sided printing, even if the user is on a mobile device or the printer lacks software support.

The project is split into two distinct services orchestrated by Docker Compose.

## 🚀 Project Structure

The project is structured into two main directories: the user-facing frontend application and the backend service that interfaces with the printer.

```
/Print Project
  ├── docker-compose.yml       <- Orchestrates both services
  │
  ├── /printle-web-app         (Frontend: React, Vite, Nginx)
  │   ├── src/
  │   │   ├── App.tsx          <- Main React application with UI logic
  │   │   ├── main.tsx
  │   │   └── index.css
  │   ├── index.html
  │   ├── package.json
  │   ├── Dockerfile           <- Multi-stage build
  │   └── nginx.conf           <- Nginx config for serving static files & proxying API
  │
  └── /printle-server          (Backend: Node.js, Express, IPP)
      ├── uploads/             <- Temporary storage for uploaded files
      ├── server.js            <- Main server logic (IPP, PDF processing)
      ├── package.json         <- Defines ipp, express, pdf-lib dependencies
      └── Dockerfile           <- Defines Node environment
```

## ✨ Features

### Frontend (User Interface)
- **Mobile & Desktop Friendly:** Fully responsive design using Tailwind CSS.
- **Real-time Status:** Shows upload and print status.
- **Print Configuration:**
    - **Custom Page Range:** Supports standard range formats (e.g., `1-3, 5`).
    - **Grayscale Conversion:** Sends the IPP `monochrome` command to the printer for reliable grayscale printing.
    - **Duplex Cycling:** Toggle between **Off**, **Manual Duplex** (software split with pause for flipping), and **Automatic** (printer hardware handles it via `sides: 'two-sided-long-edge'`).

### Backend (Server Logic)
- **IPP Communication:** Uses the `ipp` library to send print requests to the configured printer address.
- **File Handling:** Uses `multer` to securely receive and temporarily store uploaded files.
- **PDF Processing (`pdf-lib`):**
    - Filters pages based on the user's defined **Page Range**.
    - Splits documents into **Odd** and **Even** pages for **Manual Duplex** mode.

## ⚙️ Local Development Setup (Pre-Docker)
If you need to make changes, follow these steps to run the application outside of Docker.

### Prerequisites
- Node.js (v20+)
- npm
- A printer with a known **IPP Address** (e.g., `ipp://192.168.1.50:631/printers/main`)

### Step 1: Frontend Setup (`printle-web-app`)
1. Navigate to the directory: `cd printle-web-app`
2. Install dependencies: `npm install`
3. Start the development server: `npm run dev`
    - _Output will show the local IP address (e.g., `http://192.168.1.X:5173`)._
    
### Step 2: Backend Setup (`printle-server`)
1. Navigate to the directory in a **new terminal window**: `cd printle-server`
2. Install dependencies: `npm install`
3. Start the server: `npm run dev` (or `node server.js`)
    - _Server will run on port 3001._
    
### Step 3: Application Configuration
1. Access the frontend URL on your device (e.g., `http://192.168.1.X:5173`).
2. Go to **Settings** and update:
    - **PrintLe Server URL:** `http://[Your Local IP Address]:3001` (e.g., `http://10.0.0.179:3001`)
    - **IPP Address:** The specific network address of your printer.
        

## 🐳 Docker Deployment Setup
For production use, the application should be deployed using Docker Compose.
### Prerequisites
- Docker and Docker Compose installed on the server that is connected to the network (and can reach the IPP printer).
### Deployment Steps
1. Ensure all necessary Dockerfiles (`printle-web-app/Dockerfile`, `printle-server/Dockerfile`, `printle-web-app/nginx.conf`) and the main `docker-compose.yml` file are in the correct locations.
2. In the root directory (`/Print Project`), execute the deployment command:
    
    ```
    docker-compose up -d --build
    ```
    Default Port for Web interface: 80
