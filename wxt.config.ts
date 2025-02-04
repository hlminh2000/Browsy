import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
const configs = defineConfig({
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    permissions: [ 'sidePanel' ],
    "content_security_policy": {
      "extension_pages": "style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval' http://localhost:3000; default-src 'self' data:; connect-src 'self' data: http://localhost:3000 ws://localhost:3000 https://huggingface.co https://cdn-lfs.huggingface.co https://cdn-lfs-us-1.huggingface.co https://raw.githubusercontent.com https://cdn-lfs-us-1.hf.co https://tfhub.dev https://storage.googleapis.com https://www.kaggle.com https://api.openai.com",
    },
    options_ui: {
      page: "options.html",
      open_in_tab: true
    }

  },
});

export default configs;
