const resolveTemplate = require("../../templateResolver");

async function executeCalculate(step, context) {
  const config = step.config?.config || step.config || {};
  const operation = config.operation || "add";
  const rawA = resolveTemplate(config.valueA || "0", context);
  const rawB = resolveTemplate(config.valueB || "0", context);

  const numA = Number(rawA) || 0;
  const numB = Number(rawB) || 0;

  let result = 0;
  switch (operation) {
    case "subtract":
      result = numA - numB;
      break;
    case "multiply":
      result = numA * numB;
      break;
    case "divide":
      if (numB === 0) throw new Error("Division by zero is not allowed");
      result = numA / numB;
      break;
    case "round":
      const factor = Math.pow(10, Math.max(0, Math.floor(numB)));
      result = Math.round(numA * factor) / factor;
      break;
    case "add":
    default:
      result = numA + numB;
      break;
  }

  return {
    output: {
      result,
      operation,
      inputs: { a: numA, b: numB },
    },
  };
}

module.exports = executeCalculate;
