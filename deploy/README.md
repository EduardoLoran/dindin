# Deploy no Debian 13

## 1. Pacotes e usuario

```bash
sudo apt update
sudo apt install -y nginx sqlite3 certbot python3-certbot-nginx git
sudo useradd --system --home /opt/dindin --shell /usr/sbin/nologin dindin
sudo install -d -o root -g dindin -m 0750 /opt/dindin
sudo install -d -o dindin -g dindin -m 0700 /var/lib/dindin
```

Instale Node.js 24 e confirme que `command -v node` devolve `/usr/bin/node`.

## 2. Codigo e build

```bash
sudo git clone <URL_PRIVADA_DO_REPOSITORIO> /opt/dindin
cd /opt/dindin
sudo npm ci --prefix frontend
sudo npm run build
sudo npm test
sudo chown -R root:dindin /opt/dindin
sudo chmod -R u=rwX,g=rX,o= /opt/dindin
```

## 3. Banco fora do clone

Antes de mover um banco existente, pare o servico e gere o backup descrito na secao 7.

```bash
sudo systemctl stop dindin 2>/dev/null || true
sudo cp /opt/dindin/data/gastos.sqlite /var/lib/dindin/gastos.sqlite
sudo chown dindin:dindin /var/lib/dindin/gastos.sqlite
sudo chmod 600 /var/lib/dindin/gastos.sqlite
```

Em instalacao vazia, o arquivo sera criado automaticamente em `DB_FILE`.

## 4. Segredos

```bash
sudo install -o root -g root -m 600 /opt/dindin/.env.example /etc/dindin.env
sudo nano /etc/dindin.env
```

Preencha `PUBLIC_URL`, `ALLOWED_ORIGINS`, Cloudflare Turnstile, SMTP e `DB_FILE=/var/lib/dindin/gastos.sqlite`. As variaveis `INITIAL_ADMIN_*` sao usadas somente se o banco estiver vazio; depois da primeira inicializacao, remova a senha inicial do arquivo.

### Cloudflare Turnstile

No painel da Cloudflare, abra `Turnstile`, crie um widget chamado `Dindin Producao` no modo `Managed` e autorize somente estes hostnames:

```text
dindin-custos.com.br
www.dindin-custos.com.br
dindin.vps-kinghost.net
www.dindin.vps-kinghost.net
```

Use a chave publica como `TURNSTILE_SITE_KEY` e a chave secreta como `TURNSTILE_SECRET_KEY` em `/etc/dindin.env`. Nunca coloque a chave secreta no frontend ou no Git:

```dotenv
TURNSTILE_REQUIRED=true
TURNSTILE_SITE_KEY=CHAVE_PUBLICA_REAL
TURNSTILE_SECRET_KEY=CHAVE_SECRETA_REAL
TURNSTILE_ALLOWED_HOSTS=dindin-custos.com.br,www.dindin-custos.com.br,dindin.vps-kinghost.net,www.dindin.vps-kinghost.net
```

As chaves oficiais de teste devem permanecer apenas no `.env.local`. A aplicacao recusa essas chaves quando `NODE_ENV=production`.

## 5. systemd e Nginx

```bash
sudo install -o root -g root -m 644 /opt/dindin/deploy/dindin.service /etc/systemd/system/dindin.service
sudo install -o root -g root -m 644 /opt/dindin/deploy/nginx-dindin.conf /etc/nginx/sites-available/dindin
sudo ln -sfn /etc/nginx/sites-available/dindin /etc/nginx/sites-enabled/dindin
sudo rm -f /etc/nginx/sites-enabled/dindi /etc/nginx/sites-enabled/dindin_kinghost
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable --now dindin nginx
```

Confirme que existe somente um arquivo ativo para os nomes do Dindin:

```bash
sudo grep -R "server_name" /etc/nginx/sites-enabled /etc/nginx/conf.d
curl -I http://127.0.0.1:3030
```

## 6. HTTPS

Todos os nomes enviados ao Certbot precisam apontar para a VPS. Remova do comando qualquer nome que ainda nao resolva no DNS.

```bash
sudo certbot --nginx \
  -d dindin-custos.com.br \
  -d www.dindin-custos.com.br \
  -d dindin.vps-kinghost.net \
  -d www.dindin.vps-kinghost.net
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
```

## 7. Backup verificavel

```bash
sudo install -o root -g root -m 750 /opt/dindin/scripts/backup-sqlite.sh /usr/local/sbin/backup-dindin
sudo /usr/local/sbin/backup-dindin
```

O script usa a API de backup do SQLite e executa `PRAGMA integrity_check`. Guarde uma copia fora da VPS antes de migracoes, deploys e reescrita do historico Git.

## 8. Atualizacoes

```bash
sudo /usr/local/sbin/backup-dindin
sudo systemctl stop dindin
cd /opt/dindin
sudo git pull --ff-only
sudo npm ci --prefix frontend
sudo npm run build
sudo npm test
sudo chown -R root:dindin /opt/dindin
sudo chmod -R u=rwX,g=rX,o= /opt/dindin
sudo systemctl start dindin
sudo systemctl status dindin --no-pager -l
```

Depois de uma reescrita do historico Git, nao use `git pull` no clone antigo. Renomeie `/opt/dindin`, clone novamente e mantenha `/var/lib/dindin` intacto.

## 9. Limpeza definitiva do historico Git

Execute esta etapa no computador de desenvolvimento somente depois de:

1. Rodar `sudo /usr/local/sbin/backup-dindin` na VPS.
2. Copiar o `.sqlite` e o `.sha256` gerados para outra maquina.
3. Validar o hash da copia e confirmar que `PRAGMA integrity_check` retorna `ok`.
4. Commitar todas as mudancas atuais e avisar quem tiver outro clone.

Instale `git-filter-repo` e execute a trava de seguranca:

```powershell
pipx install git-filter-repo
.\scripts\rewrite-history.ps1 BACKUP_VPS_CONFIRMADO
git fetch origin --prune
git push --force-with-lease origin --all
git push --force-with-lease origin --tags
```

Na VPS, preserve o banco externo e substitua o clone antigo:

```bash
sudo systemctl stop dindin
sudo mv /opt/dindin /opt/dindin-clone-antigo
sudo git clone <URL_PRIVADA_DO_REPOSITORIO> /opt/dindin
cd /opt/dindin
sudo npm ci --prefix frontend
sudo npm run build
sudo npm test
sudo chown -R root:dindin /opt/dindin
sudo chmod -R u=rwX,g=rX,o= /opt/dindin
sudo systemctl start dindin
sudo systemctl status dindin --no-pager -l
```

Nao remova `/opt/dindin-clone-antigo` ate confirmar login, lancamentos, fechamento de mes e recuperacao de senha em producao. O banco ativo permanece em `/var/lib/dindin/gastos.sqlite`.
