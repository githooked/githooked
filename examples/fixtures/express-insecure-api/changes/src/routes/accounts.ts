import { Router } from 'express';
import { accounts } from '../database.js';

export const accountsRouter = Router().get('/:accountId', (request, response) => {
  response.json(accounts.find((account) => account.id === request.params.accountId));
});
