import { sendMessage, onMessage } from "webext-bridge/content-script";



export default defineContentScript({
  matches: ['<all_urls>'],

  main(ctx) {
    console.log('Hello content.');
    console.log(ctx);

    onMessage(ctx, async (message) => {
      console.log("message: ", message)
    })

    onMessage("GET_CONTENT", async (message) => {
      const {
        sender,
      } = message;

      console.log(sender.context, sender.tabId); // > devtools  156

      await sendMessage(
        "CONTENT",
        { sync: false },
        "background"
      );
    });


  },
});
