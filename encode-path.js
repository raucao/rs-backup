export default function encodePath(path) {
  return encodeURIComponent(path).replace(/%2F/g, '/');
}
