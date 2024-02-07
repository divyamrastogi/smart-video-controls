// Function to get the nth-child selector

// utilityFunctions.js

/**
 * Generates a unique CSS selector for a given element.
 * @param {Element} el - The DOM element for which to generate the selector.
 * @returns {string} The unique CSS selector for the element.
 */
function generateSelector(el) {
  if (!el || !el.tagName) return "";

  // Function to get unique identifier for element
  const id = el.id ? `#${el.id}` : "";
  if (id) return id; // If the element has an id, that's usually enough

  const classNames = el.className
    ? `.${el.className.split(/\s+/).join(".")}`
    : "";
  const tagName = el.tagName.toLowerCase();
  const nthChild = getNthChild(el);
  const selector = `${tagName}${classNames}${nthChild}`;

  // If the generated selector uniquely identifies the element, use it
  if (document.querySelectorAll(selector).length === 1) {
    return selector;
  }

  // Otherwise, try to prefix with parent's selector
  if (el.parentElement) {
    const parentSelector = generateSelector(el.parentElement);
    return `${parentSelector} > ${selector}`;
  }

  return selector; // Fallback to less specific selector
}

/**
 * Calculates the nth-child index of an element relative to its siblings.
 * @param {Element} element - The DOM element for which to find the index.
 * @returns {string} The nth-child selector for the element.
 */
function getNthChild(element) {
  let childNumber = 0;
  for (
    let child = element;
    child !== null;
    child = child.previousElementSibling
  ) {
    childNumber++;
  }
  return `:nth-child(${childNumber})`;
}
