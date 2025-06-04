// eslint.config.js

module.exports = [
    {
      files: ["**/*.ts"],
      languageOptions: {
        parser: require("@typescript-eslint/parser"),
        parserOptions: {
          ecmaVersion: 2020,
          sourceType: "module"
        }
      },
      plugins: {
        "@typescript-eslint": require("@typescript-eslint/eslint-plugin")
      },
      rules: {
        "@typescript-eslint/naming-convention": "warn",
        "@typescript-eslint/semi": "warn",
        "curly": "warn",
        "eqeqeq": "warn",
        "no-throw-literal": "warn",
        "semi": "off",
        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
      }
    }
  ];