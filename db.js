/**
 * MongoDB Atlas connection setup using native MongoDB driver
 */
const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = "mongodb+srv://philianeqro:LEONBAILEY01@cluster0.eobvgxu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function connectDB() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Successfully connected to MongoDB!");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
}

module.exports = { connectDB, client };
