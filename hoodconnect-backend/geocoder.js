const NodeGeocoder = require("node-geocoder");

const geocoder = NodeGeocoder({
  provider: "openstreetmap",
});

module.exports = geocoder;