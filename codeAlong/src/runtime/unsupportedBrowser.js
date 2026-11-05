// shown instead of the code area when the page isn't cross-origin isolated, which WebContainer needs.
// our COEP header is "credentialless", which Safari's engine doesn't support, so this is every
// browser on an iPhone or iPad, and the built-in browsers of apps like WhatsApp. reloading won't help.
export const UNSUPPORTED_BROWSER =
  "This browser can't run code. Open this page in Chrome, Edge or Firefox on a computer or an Android phone (iPhones, iPads and apps' built-in browsers can't run it)."
