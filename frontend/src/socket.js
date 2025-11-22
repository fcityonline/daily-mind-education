import { io } from "socket.io-client";

const token = localStorage.getItem("token");

export const socket = io(process.env.REACT_APP_API_URL.replace("/api", ""), {
  auth: { token }
});
