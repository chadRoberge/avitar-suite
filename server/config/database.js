const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Reuse existing connection if already connected
    if (mongoose.connection.readyState === 1) {
      console.log('MongoDB already connected, reusing connection');
      return mongoose.connection;
    }

    // Connect to MongoDB
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10, // Limit connections for serverless
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error('Database connection error:', error.message);

    // In serverless environments (Vercel), don't exit process
    // Just throw the error and let the function fail gracefully
    if (process.env.VERCEL) {
      throw error;
    } else {
      process.exit(1);
    }
  }
};

// Handle connection events
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected from MongoDB');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed through app termination');
  process.exit(0);
});

module.exports = connectDB;
