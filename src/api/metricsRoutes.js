const express = require('express');
const router = express.Router();
const metrics = require('../utils/metrics');

// Metrics endpoint for Prometheus scraping
router.get('', async (req, res) => {
  res.set('Content-Type', metrics.contentType);
  res.end(await metrics.register.metrics());
});

// Get metrics as JSON for internal use
router.get('/json', async (req, res) => {
  try {
    const metricsJson = await metrics.getMetricsAsJson();
    res.json(metricsJson);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 