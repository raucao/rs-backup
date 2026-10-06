import WebFinger from 'webfinger.js';

const discovery = {
  async lookup(userAddress) {
    const webfinger = new WebFinger({
      tls_only: false,
      uri_fallback: false,
      request_timeout: 5000,
      allow_private_addresses: true
    });

    const response = await webfinger.lookup(userAddress);
    const remoteStorage = response.idx.links.remotestorage;

    if (!Array.isArray(remoteStorage) || remoteStorage.length <= 0) {
      throw new Error(`WebFinger record for ${userAddress} does not have remotestorage defined in the links section.`);
    }

    const rs = remoteStorage[0];
    const properties = rs.properties ?? {};
    const authURL = properties['http://tools.ietf.org/html/rfc6749#section-4.2'] || properties['auth-endpoint'];
    const version = properties['http://remotestorage.io/spec/version'] || rs.type;

    return {
      href: rs.href,
      authURL,
      version,
      properties
    };
  }
};

export default discovery;
