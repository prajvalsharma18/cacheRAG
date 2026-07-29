function normalizeQuery(query) {
  return query
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { normalizeQuery };
