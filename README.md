# a3-sistema-reserva-hoteis
Sistema de reserva e gestão de hotéis — Projeto A3 UNISUL

---

## Tecnologias Utilizadas

- **Runtime:** [Node.js](https://nodejs.org/) (v18+)
- **Framework Web:** [Express](https://expressjs.com/)
- **Banco de Dados:** SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- **Testes Automatizados:** [Jest](https://jestjs.io/) e [Supertest](https://github.com/ladjs/supertest)
- **Hot Reload (Desenvolvimento):** [Nodemon](https://nodemon.io/)

---

## Estrutura do Projeto

```text
a3-sistema-reserva-hoteis/
├── src/
│   ├── controllers/      # Controladores (recebem requisições e devolvem respostas)
│   ├── database/         # Conexão e configuração do banco SQLite (better-sqlite3)
│   ├── models/           # Modelos de dados e representação das entidades
│   ├── routes/           # Definição e agrupamento das rotas da API
│   ├── services/         # Regras de negócio da aplicação
│   ├── app.js            # Configuração do Express, middlewares e rotas
│   └── server.js         # Inicialização do servidor HTTP e do banco
├── tests/
│   └── health.test.js    # Testes automatizados (Jest + Supertest)
├── .env.example          # Exemplo das variáveis de ambiente utilizadas
├── .gitignore
├── jest.config.js        # Configuração do Jest
├── LICENSE
├── package.json
├── package-lock.json
└── README.md
```

---

## Instalação e Execução

### 1. Pré-requisitos
Ter o [Node.js](https://nodejs.org/) instalado.

### 2. Instalar as dependências
Na raiz do repositório:

```bash
npm install
```

### 3. Executar em modo de desenvolvimento
Inicia o servidor com recarregamento automático (Nodemon):

```bash
npm run dev
```

O servidor ficará disponível em `http://localhost:3000`.

#### Variáveis de ambiente

As variáveis utilizadas estão documentadas no arquivo [.env.example](.env.example):

| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `PORT` | `3000` | Porta em que o servidor HTTP é iniciado |

> A aplicação ainda não carrega arquivos `.env` automaticamente. Para usar outra porta, defina a variável no terminal antes de iniciar o servidor, por exemplo no PowerShell: `$env:PORT=4000; npm start` (ou `PORT=4000 npm start` no Linux/macOS).

### 4. Executar em modo normal

```bash
npm start
```

### 5. Executar os testes

```bash
npm test
```

> Durante os testes, o banco SQLite é criado em memória (`:memory:`), sem afetar o arquivo `database.sqlite` usado na execução normal.

---

## Rotas Disponíveis

| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `GET` | `/health` | Verifica se o servidor e a conexão com o SQLite estão funcionando |

Exemplo de resposta:

```json
{
  "status": "ok",
  "uptime": 1.23,
  "timestamp": "2026-11-16T23:00:00.000Z",
  "database": "connected"
}
```

---

## Licença

Distribuído sob a licença MIT. Veja o arquivo [LICENSE](LICENSE).
