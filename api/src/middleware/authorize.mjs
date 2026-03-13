// ════════════════════════════════════════════════════════════════════
// Authorization Middleware — RBAC role check
// ════════════════════════════════════════════════════════════════════
// Guards routes by requiring the authenticated user to hold at least
// one of the specified roles.  The `admin` role implicitly grants
// access to every route (bypass).
// ════════════════════════════════════════════════════════════════════

/**
 * Build an Express middleware that checks `request.user.roles` against
 * a whitelist.  Admin always passes.
 *
 * @param  {...string} requiredRoles - At least one of these must be present
 * @returns {Function} Express middleware
 */
export function authorize(...requiredRoles) {
  return function checkAuthorization(request, response, next) {
    const userRoles = request.user?.roles || [];

    const isAdmin = userRoles.includes('admin');
    const hasRequiredRole = requiredRoles.some((role) => userRoles.includes(role));

    if (isAdmin || hasRequiredRole) {
      next();
      return;
    }

    response.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
      },
    });
  };
}

/**
 * Middleware that verifies the requesting user owns the review or is admin.
 * Must be placed AFTER `authenticate` and after `request.params.reviewId` is set.
 *
 * @param {object} database - SessionPerQueryWrapper instance
 * @returns {Function} Express middleware
 */
export function requireOwnershipOrAdmin(database) {
  return async function checkOwnership(request, response, next) {
    const userRoles = request.user?.roles || [];

    if (userRoles.includes('admin')) {
      next();
      return;
    }

    const reviewId = request.params.reviewId;
    if (!reviewId) {
      response.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing reviewId' } });
      return;
    }

    try {
      const result = await database.query(
        `MATCH (review:Review {reviewId: $reviewId})
         RETURN review.createdBy AS createdBy`,
        { reviewId }
      );

      if (result.length === 0) {
        response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Review not found' } });
        return;
      }

      const createdBy = result[0].createdBy;
      const username = request.user?.preferred_username;

      if (createdBy === username) {
        next();
        return;
      }

      response.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this review' },
      });
    } catch (error) {
      response.status(500).json({ error: { code: 'INTERNAL', message: error.message } });
    }
  };
}
