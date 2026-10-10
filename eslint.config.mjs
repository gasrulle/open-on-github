import { defineConfig } from "eslint/config";
import typescriptEslint from "typescript-eslint";

export default defineConfig(
    {
        files: ["**/*.ts"],
        plugins: {
            "@typescript-eslint": typescriptEslint.plugin,
        },
        languageOptions: {
            parser: typescriptEslint.parser,
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            "@typescript-eslint/naming-convention": [
                "warn",
                {
                    selector: "import",
                    format: ["camelCase", "PascalCase"],
                },
            ],
            "@typescript-eslint/no-floating-promises": "warn",
            "@typescript-eslint/only-throw-error": "warn",
            curly: "warn",
            eqeqeq: "warn",
            semi: "warn",
        },
    },
);
