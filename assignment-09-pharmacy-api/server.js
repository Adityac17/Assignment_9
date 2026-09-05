require('dotenv').config();
const express = require('express');
const cors = require('cors');

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const medicineRoutes = require('./routes/medicineRoutes');
const orderRoutes = require('./routes/orderRoutes');

const app = express();

// Global middleware
app.use(cors());
app.use(express.json());

// Health check / root
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Pharmacy & Healthcare Store API is running',
    data: {
      endpoints: ['/api/auth', '/api/medicines', '/api/orders'],
    },
  });
});

// Feature routes
app.use('/api/auth', authRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/orders', orderRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Centralized error handler — consistent JSON shape.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

const PORT = process.env.PORT || 5000;

// Attempt DB connection but ALWAYS start Express (per assignment constraint:
// no live MongoDB Atlas is guaranteed — boot with a clear warning, do not crash).
connectDB().then((connected) => {
  app.listen(PORT, () => {
    console.log(`[server] Pharmacy API listening on port ${PORT}`);
    if (!connected) {
      console.warn(
        '[server] Running WITHOUT a database connection. Auth/medicine/order routes ' +
          'will return errors until a valid MONGO_URI is configured.'
      );
    }
  });
});

module.exports = app;
