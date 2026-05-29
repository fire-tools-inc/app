import { Router, type Request, type Response } from 'express';

/**
 * Catch-all router that signals that an OpenAPI-defined endpoint exists in the
 * contract (docs/api/openapi.yaml) but the implementation is still pending.
 * Returns 501 with a stable error payload so clients can detect and skip.
 */
export const buildNotImplementedRouter = (): Router => {
  const router = Router();

  router.use((req: Request, res: Response) => {
    res.status(501).json({
      error: {
        code: 'not_implemented',
        message:
          `Endpoint ${req.method} ${req.originalUrl} is defined in the OpenAPI ` +
          `contract (docs/api/openapi.yaml) but not yet implemented by this server scaffold.`,
        details: { contract: 'docs/api/openapi.yaml' },
      },
    });
  });

  return router;
};
