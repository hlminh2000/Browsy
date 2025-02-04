import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    permissions: [ 'sidePanel' ],
    options_ui: {
      page: "options.html",
      open_in_tab: true
    }
  },
});
