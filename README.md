# schemastore json
offline schemastore.
in vscode, you can config your `.vscode/settings.json`:
```json
"json.schemas": [
	{
		"fileMatch": ["tsconfig*.json"],
		"url": "node_modules/schemastore/json/json/tsconfig.json"
	}
]
```