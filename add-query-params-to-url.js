export default function addQueryParamsToURL(url, params) {
  const separator = url.match(/\?\w+=/) ? '&' : '?';
  return url + separator + new URLSearchParams(params).toString();
}
