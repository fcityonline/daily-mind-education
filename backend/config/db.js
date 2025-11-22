// backend/config/db.js
import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    
    // Check if MONGODB_URI is set
    if (!mongoUri) {
      console.error("⚰️💀 :- MONGODB_URI environment variable is not set!");
      console.error("Please add MONGODB_URI to your .env file");
      process.exit(1);
    }

    // Trim whitespace and check format
    const trimmedUri = mongoUri.trim();
    
    // Validate MongoDB URI format
    if (!trimmedUri.startsWith("mongodb://") && !trimmedUri.startsWith("mongodb+srv://")) {
      console.error("⚰️💀 :- Invalid MongoDB URI format!");
      console.error("Expected URI to start with 'mongodb://' or 'mongodb+srv://'");
      console.error("Current URI (first 20 chars):", trimmedUri.substring(0, 20) + "...");
      console.error("Please check your .env file MONGODB_URI value");
      process.exit(1);
    }

    console.log("🔄 Connecting to MongoDB...");
    await mongoose.connect(trimmedUri, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    });
    console.log("✅ MongoDB connected 👍");
  } catch (err) {
    console.error("⚰️💀 :- DB connection failed:", err.message);
    console.error("Error details:", err);
    if (err.message.includes("Invalid scheme")) {
      console.error("\n💡 TIP: Your MONGODB_URI in .env should look like:");
      console.error("   mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority");
      console.error("   or");
      console.error("   mongodb://username:password@host:port/database");
    }
    process.exit(1);
  }
};
