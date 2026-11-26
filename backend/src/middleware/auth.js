import {
  AuthenticationError,
  ConfigurationError,
  ForbiddenError,
} from "../models/AppError.js";

export function authenticate({ auth, repository, scopedClient }) {
  return async (req, res, next) => {
    if (!auth) throw new ConfigurationError();
    const match = req.get("authorization")?.match(/^Bearer ([^\s]+)$/i);
    if (!match) throw new AuthenticationError();
    const { data, error } = await auth.auth.getUser(match[1]);
    if (error || !data.user) throw new AuthenticationError();
    const client = scopedClient(match[1]);
    let profile;
    try {
      profile = await repository.profile(data.user.id, client);
    } catch (error) {
      if (error.status === 404)
        throw new ForbiddenError(
          "Your account has not been registered with the library.",
        );
      throw error;
    }
    if (profile.status !== "ACTIVE")
      throw new ForbiddenError(
        "Your account is inactive. Please contact the library.",
      );
    req.user = { ...profile, email: data.user.email, client };
    next();
  };
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) throw new AuthenticationError();
    if (!roles.includes(req.user.role)) throw new ForbiddenError();
    next();
  };
}
