# UniHorizonte Backend
## CORS
As origens permitidas ficam em `cors-origins.txt`, na raiz do backend. Esse arquivo é local e não é versionado. Para criá-lo a partir do exemplo, execute `npm run setup:cors` ou `Copy-Item cors-origins.example.txt cors-origins.txt` no PowerShell. O script não sobrescreve um arquivo existente.

Use uma origem por linha (`protocolo://host:porta`, sem caminho); linhas vazias e linhas iniciadas por `#` são ignoradas. Edite o arquivo quando precisar liberar outro ambiente e **reinicie o backend** após qualquer alteração. Se o arquivo não existir ou não tiver origens, usa-se `CORS_ORIGINS` no `.env` (lista separada por vírgulas); se também não estiver configurada, a origem padrão é `http://localhost:5173`. No boot, o log `CORS origins loaded` indica a fonte (`file`, `env` ou `default`) e as origens carregadas.

Exemplo para landing e dashboard em produção (substitua pelos domínios reais):

```txt
https://seudominio.com
https://www.seudominio.com
https://admin.seudominio.com
```

Exemplo para acesso de outra máquina na rede local (substitua pelos IPs reais):

```txt
http://192.168.0.10:5173
http://192.168.0.20:5174
```

A origem precisa corresponder exatamente à URL do navegador, incluindo esquema e porta. Após reiniciar, teste o cabeçalho `access-control-allow-origin` com a origem real do frontend; um erro de login pode ter outra causa mesmo quando o CORS está correto.
