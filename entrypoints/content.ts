
function getXPath(element: Element) {
  // If element has ID, use the simplest possible XPath
  if (element.id) {
    return `//*[@id="${element.id}"]`;
  }

  // Try to find a unique attribute combination
  const tag = element.tagName.toLowerCase();
  const attributes = ['name', 'role', 'type', 'placeholder', 'aria-label', 'title', 'value'];
  for (const attr of attributes) {
    const value = element.getAttribute(attr);
    if (value) {
      return `//${tag}[@${attr}="${value}"]`;
    }
  }

  // If no unique attributes, build path using DOM structure
  const path = [];
  let current = element;

  while (current !== document.documentElement && current.parentNode) {
    let index = 0;
    const siblings = current.parentNode.children;

    // Find position among siblings with same tag
    for (let i = 0; i < siblings.length; i++) {
      if (siblings[i].tagName === current.tagName) {
        index++;
      }
      if (siblings[i] === current) {
        const position = index > 1 ? `[${index}]` : '';
        path.unshift(current.tagName.toLowerCase() + position);
        break;
      }
    }

    current = current.parentNode as Element;
  }

  // Construct final XPath
  return ['/html', ...path].join('/');
}

function getInteractiveElements() {
  const selectors = [
    'button:not([disabled])',
    'form',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    '[role="button"]',
    '[contenteditable]'
  ];

  return Array.from(document.querySelectorAll(selectors.join(',')))
    .filter(el => {
      const style = window.getComputedStyle(el);
      return style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        el.checkVisibility();
    })
    .map(el => ({
      text: el.textContent?.trim().slice(0, 100), // Truncate long text
      xpath: getXPath(el),
      tag: el.tagName.toLowerCase(),
      // attributes: Array.from(el.attributes)
      //   // .filter(attr => !['class', 'style'].includes(attr.name))
      //   .reduce((obj, attr) => {
      //     obj[attr.name] = attr.value;
      //     return obj;
      //   }, {} as Record<string, string>)
    }))
    .reduce((acc, obj) => {
      acc[obj.xpath] = obj
      return acc
    }, {} as Record<string, any>);
}

export default defineContentScript({
  matches: ['<all_urls>'],
  main(ctx) {
    chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
      console.log("request: ", request)
      let response: any
      if (request.type === "get_page_content") {
        response = document.body.innerText;
      }
      else if (request.type === "get_interactive_elements") {
        const interactiveElements = getInteractiveElements()
        response = interactiveElements;
      }
      else if (request.type === "perform_action") {
        const { action, elementXpah, value } = request
        const element = document.evaluate(
          elementXpah,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        ).singleNodeValue as HTMLElement
        if (!element) return sendResponse("Could not perform the action")
        if (action === "click") {
          element?.click()
        } else if (action === "type") {
          (element as HTMLInputElement).value = ""
          await new Promise(resolve => setTimeout(resolve, 100))
          for (const char of value) {
            (element as HTMLInputElement).value += char
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        } else if (action === "submit") {
          (element as HTMLFormElement).submit()
        }
        response = document.title;
      }
      console.log("response: ", response)
      return sendResponse(response)
    })
  },
});
