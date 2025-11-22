// import { useEffect } from "react";
// import { socket } from "../utils/notifications";

// export default function NotificationListener() {
//   useEffect(() => {
//     // Receive notification
//     socket.on("notification", (data) => {
//       console.log("🔔 Notification received:", data);

//       // Browser Notification
//       if (Notification.permission === "granted") {
//         new Notification("Daily Mind Education", {
//           body: data.message,
//           icon: "/logo-DME.png"
//         });
//       }

//       // In-app fallback
//       alert(data.message);
//     });

//     return () => {
//       socket.off("notification");
//     };
//   }, []);

//   return null;
// }
