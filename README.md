# EZVIZ Multi-View Web App

This is a React-based web application that allows you to view multiple EZVIZ camera streams simultaneously on a single page. It supports both Live Stream and Playback modes with individual and synchronized controls.

## Features
- **Multi-View Grid**: Display up to 50 cameras in a responsive grid.
- **Unified Credentials**: Use a single Access Token (or AppKey/Secret) to fetch and view all devices automatically.
- **Global & Individual Controls**: Play/Stop all cameras at once using the sidebar, or control each camera individually on its card to save bandwidth.
- **Live & Playback Modes**: Switch between real-time feeds and historical recordings (from SD Card or Cloud).

---

## 🐳 Deployment (Docker)

The easiest way to build and run this application is using Docker Compose. This setup compiles the React app into static files and serves them via a lightweight Nginx container.

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Docker Engine installed.

### Building and Running the App

1. Clone this repository to your local machine.
2. Open a terminal in the project directory.
3. Run the following command to build the image and start the container in the background:

   ```bash
   docker compose up -d --build
   ```

4. Open your web browser and navigate to:
   **[http://localhost:8080](http://localhost:8080)**

### Stopping the App

To stop the running container, simply execute:
```bash
docker compose down
```

---

## 💻 Local Development (Without Docker)

If you wish to run the app locally for development purposes (to test code changes instantly):

1. Install Node.js (v18 or higher recommended).
2. Install the project dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. Open the local URL provided in your terminal (usually `http://localhost:5173`).
