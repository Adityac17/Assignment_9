const mongoose = require('mongoose');

/**
 * Connects to MongoDB using MONGO_URI from the environment.
 *
 * Per the assignment constraint, no live MongoDB Atlas cluster is guaranteed.
 * This function NEVER throws or exits the process: if the URI is missing or the
 * connection fails, it logs a clear warning and resolves, so server.js can still
 * boot Express. All Mongoose model logic is written against real queries, so once
 * a valid MONGO_URI is supplied the API is fully functional.
 *
 * @returns {Promise<boolean>} true if connected, false otherwise.
 */
const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.warn(
      '[db] WARNING: MONGO_URI is not set. Server will start WITHOUT a database connection.\n' +
        '      Set MONGO_URI in your .env file to enable persistence (see README "Database Setup").'
    );
    return false;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[db] MongoDB connected: ${conn.connection.host}`);
    return true;
  } catch (err) {
    console.warn(
      `[db] WARNING: MongoDB connection failed: ${err.message}\n` +
        '      Server will still start, but database-backed routes will error until a valid MONGO_URI is provided.'
    );
    return false;
  }
};

module.exports = connectDB;
