export const mathIntegration = {
  id: "math",
  name: "Math by Flowline",
  description: "Perform basic mathematical calculations, increments, or rounding",
  icon: "math",
  authType: "none",
  actions: [
    {
      id: "calculate",
      name: "Perform Calculation",
      description: "Add, subtract, multiply, divide, or round numbers",
      fields: [
        {
          key: "operation",
          label: "Operation",
          type: "dropdown",
          required: true,
          options: [
            { label: "Add (First + Second)", value: "add" },
            { label: "Subtract (First - Second)", value: "subtract" },
            { label: "Multiply (First * Second)", value: "multiply" },
            { label: "Divide (First / Second)", value: "divide" },
            { label: "Round (to decimal places)", value: "round" },
          ],
          defaultValue: "add",
        },
        {
          key: "valueA",
          label: "First Number",
          type: "pill_input",
          required: true,
          placeholder: "e.g. {{trigger.body.amount}} or 100",
        },
        {
          key: "valueB",
          label: "Second Number / Precision",
          type: "pill_input",
          required: true,
          placeholder: "e.g. {{trigger.body.tax}} or 2",
        },
      ],
    },
  ],
};
