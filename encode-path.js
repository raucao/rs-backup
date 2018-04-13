module.exports = function(path) {
  return encodeURIComponent(path).replace(/%2F/g, '/');
};
