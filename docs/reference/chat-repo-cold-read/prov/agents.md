# Agents

| ID | Agent | Type | Role |
|---|---|---|---|
| ag:user | the user | Person | Supplied inputs (zips, URLs), set direction, approved next steps |
| ag:claude | Claude (Anthropic assistant) | SoftwareAgent | Read, analysed, built demos, wrote this repo |
| ag:sandbox | bash/file tools | SoftwareAgent | Executed commands, no network |
| ag:web | web_fetch / web_search tools | SoftwareAgent | Retrieved pages (power-turtle) |
| ag:publish | Artifact tool | SoftwareAgent | Hosted the demo pages |
