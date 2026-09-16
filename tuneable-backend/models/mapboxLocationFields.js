/**
 * Shared Mapbox location subdocument used by User and Media.
 * Persist every Mapbox v6 context layer we receive; UI may still show a coarser label.
 */
function mapboxLocationFields() {
  return {
    city: { type: String },
    region: { type: String }, // State, province, or region
    country: { type: String },
    countryCode: { type: String }, // ISO 3166-1 alpha-2 (e.g. "US", "GB", "FR")
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
    detectedFromIP: { type: Boolean, default: false },
    placeProvider: { type: String, enum: ['mapbox'] },
    placeId: { type: String },
    featureType: { type: String },
    ancestorIds: [{ type: String }],
    ancestors: [{
      placeId: { type: String },
      label: { type: String },
      placetype: { type: String },
      regionCode: { type: String },
      countryCode: { type: String },
      wikidataId: { type: String },
      _id: false,
    }],
    label: { type: String },
    namePreferred: { type: String },
    display: { type: String },
    placeFormatted: { type: String },
    fullAddress: { type: String },
    postcode: { type: String },
    resolvedAt: { type: Date },
  };
}

module.exports = { mapboxLocationFields };
