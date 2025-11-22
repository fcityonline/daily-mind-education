// import dotenv from 'dotenv';
// create-pilot-users.js
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import fs from "fs";
import User from "./models/User.js";
import jwt from "jsonwebtoken";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, ".env") });

// Custom name list (based on your requirement)
const customNames = [
  "Suraj Kumar",
  "Rajesh Maraiya",
  "Monam Kumari"
];

// Function to generate a stronger password
function generatePassword() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+[]{}|;:,.<>?";
  return [...Array(10)].map(() => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// Function to create pilot users and save them to DB
async function createPilotUsers(count = 3) {
  console.log("MONGODB_URI:", process.env.MONGODB_URI);
  if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI missing in .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ Connected to MongoDB\n");

  let users = [];
  let fileContent = "=== Pilot Users ===\n\n";

  for (let i = 0; i < count; i++) {
    // Select custom name from the list
    const fullName = customNames[i];
    const phone = "9" + Math.floor(100000000 + Math.random() * 900000000); // random phone number
    const email = `pilot_${Math.random().toString(36).substring(2, 7)}@test.com`; // random email
    const password = generatePassword(); // stronger password generation

    const user = new User({
      fullName,
      phone,
      email,
      password,
      isVerified: true,
      emailVerified: true,
    });

    await user.save();

    // Issue login token for testing
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    const userDetails = {
      _id: user._id.toString(),
      name: fullName,
      phone,
      email,
      password,
      loginToken: token,
    };

    users.push(userDetails);

    // Append user details to the content string for saving in a file
    fileContent += `======= USER ${i + 1} =======\n`;
    fileContent += `ID: ${userDetails._id}\n`;
    fileContent += `Name: ${userDetails.name}\n`;
    fileContent += `Phone: ${userDetails.phone}\n`;
    fileContent += `Email: ${userDetails.email}\n`;
    fileContent += `Password: ${userDetails.password}\n`;
    fileContent += `JWT Token: ${userDetails.loginToken}\n\n`;
  }

  // Save user details to a text file
  fs.writeFileSync(path.join(__dirname, "pilot-users.txt"), fileContent);

  console.log("🎉 CREATED PILOT USERS AND SAVED TO FILE:\n");
  console.log("✅ Users saved to 'pilot-users.txt' file.");

  // Optionally print user details to the console
  users.forEach((u, i) => {
    console.log(`======= USER ${i + 1} =======`);
    console.log("ID:", u._id);
    console.log("Name:", u.name);
    console.log("Phone:", u.phone);
    console.log("Email:", u.email);
    console.log("Password:", u.password);
    console.log("JWT Token:", u.loginToken);
    console.log();
  });

  mongoose.disconnect();
  console.log("Done.");
}

// Create 3 pilot users with custom names and stronger passwords
createPilotUsers(3).catch((err) => {
  console.error(err);
  process.exit(1);
});




// import path from 'path';
// import { fileURLToPath } from 'url';
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // Load environment variables
// dotenv.config();

// console.log("MONGODB_URI:", process.env.MONGODB_URI);  // Check if MONGODB_URI is loaded correctly

// import mongoose from 'mongoose';
// // import User from '../models/User.js';
// import User from './models/User.js';  // Use a relative path within the same 'backend' directory
// import jwt from 'jsonwebtoken';

// const base = 'http://localhost:5000';
// const fetch = global.fetch || (await import('node-fetch')).default;

// async function main() {
//   if (!process.env.MONGODB_URI) {
//     console.error("MONGODB_URI is undefined! Please check your .env file.");
//     process.exit(1);
//   }

//   await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
//   console.log('Connected to DB');

//   const phone = '9' + String(Date.now()).slice(-9); // 10 digits
//   const email = `e2e_user_${Date.now()}@example.com`;
//   const password = 'InitPass@123';
//   const name = 'E2E Direct';

//   // Create user directly in DB
//   let user = new User({ phone, email, fullName: name, password, isVerified: true, emailVerified: true });
//   await user.save();
//   console.log('User created:', { id: user._id.toString(), phone, email });

//   // Issue JWT
//   const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
//   console.log('JWT:', token);

//   console.log('Done');
//   process.exit(0);
// }

// main().catch((err) => {
//   console.error(err);
//   process.exit(2);
// });
