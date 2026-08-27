const { resolveTemplate } = require("./conditions");

/**
 * Formatter Step Executor
 * Performs text, date, and math transformations without external AI calls.
 * 
 * @param {Object} step - Step config: { action, category, input, findText, replaceText, mathOp, operand, dateFormat }
 * @param {Object} context - Execution context { trigger, steps }
 * @returns {Object} { output: { result, ... } }
 */
function executeFormatterStep(step, context) {
  const config = step.config || {};
  const category = config.category || "text"; // "text" | "number" | "date"
  const rawInput = config.input || "";
  const inputStr = resolveTemplate(context, String(rawInput));

  let result = inputStr;

  if (category === "text") {
    const action = config.action || "capitalize";
    switch (action) {
      case "uppercase":
        result = inputStr.toUpperCase();
        break;
      case "lowercase":
        result = inputStr.toLowerCase();
        break;
      case "capitalize":
        result = inputStr ? inputStr.charAt(0).toUpperCase() + inputStr.slice(1).toLowerCase() : "";
        break;
      case "split":
        const delimiter = config.delimiter || ",";
        result = inputStr.split(delimiter).map((s) => s.trim());
        break;
      case "replace":
        const findText = resolveTemplate(context, config.findText || "");
        const replaceText = resolveTemplate(context, config.replaceText || "");
        result = inputStr.replaceAll(findText, replaceText);
        break;
      default:
        result = inputStr;
    }
  } else if (category === "number") {
    const numInput = parseFloat(inputStr) || 0;
    const operand = parseFloat(resolveTemplate(context, String(config.operand || 0))) || 0;
    const mathOp = config.mathOp || "add";

    switch (mathOp) {
      case "add":
        result = numInput + operand;
        break;
      case "subtract":
        result = numInput - operand;
        break;
      case "multiply":
        result = numInput * operand;
        break;
      case "divide":
        result = operand !== 0 ? numInput / operand : 0;
        break;
      case "round":
        const decimals = parseInt(config.decimals || 0, 10);
        result = Number(numInput.toFixed(decimals));
        break;
      default:
        result = numInput;
    }
  } else if (category === "date") {
    const dateObj = new Date(inputStr || Date.now());
    if (isNaN(dateObj.getTime())) {
      result = new Date().toISOString();
    } else {
      const format = config.dateFormat || "ISO";
      if (format === "YYYY-MM-DD") {
        result = dateObj.toISOString().split("T")[0];
      } else if (format === "TIMESTRING") {
        result = dateObj.toTimeString();
      } else {
        result = dateObj.toISOString();
      }
    }
  }

  return {
    output: {
      result,
      input: inputStr,
      category,
    },
  };
}

module.exports = { executeFormatterStep };
