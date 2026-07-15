import { Router } from 'express';
import { accounts } from '../database.js';

export const accountsRouter = Router().get('/:accountId', (request, response) => {
  if (!request.user) return response.sendStatus(401);
  const account = accounts.find((candidate) => candidate.id === request.params.accountId && candidate.tenantId === request.user.tenantId);
  return account ? response.json(account) : response.sendStatus(404);
});
