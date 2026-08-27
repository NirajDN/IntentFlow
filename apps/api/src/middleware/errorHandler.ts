import { Request, Response, NextFunction } from "express";
import { apiError } from "@intentflow/shared";
import logger from "../lib/logger.js";

export interface AppError extends Error {
  statusCode?: number;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  logger.error({ err, statusCode }, err.message);
  res.status(statusCode).json(apiError(err.message ?? "Internal server error"));
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json(apiError("Route not found"));
}
