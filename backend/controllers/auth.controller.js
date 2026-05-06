import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import { sendOtpToMail, verifyMailOTP } from "../services/mail.service.js";
import {
  createAndCheckLimitSession,
  deleteAllUserSessions,
  deleteRedisKey,
  deleteSingleUserSession,
  getRedisValue,
  setRedisValue,
} from "../services/redis.service.js";
import {
  accConnectEmail,
  accConnectGoogle,
  createNewUser,
  disConnectLinkAccount,
  getGithubUserDetails,
  getGithubUserEmail,
  googleIdTokenVerify,
  loginWithEmailService,
  registerWithEmailService,
  verifyAccConnectOtp,
} from "../services/auth.service.js";
import { singleFindDirectory } from "../services/directory.service.js";
import {
  createAuthIdentity,
  exstingAuthIdentity,
  getOneAuthIdentity,
} from "../services/authIdentity.service.js";
import {
  CLEAR_COOKIE_OPTIONS,
  SESSION_OPTIONS,
} from "../constants/constant.js";
import { getSignedUrlForGetObject } from "../services/s3.service.js";
import { AVATAR_UPLOAD_FOLDER } from "../constants/s3.constants.js";
import { twoFaOnBoarding } from "../services/twofa.service.js";
import User from "../models/User.model.js";
import mongoose from "mongoose";

// register user
export const registerWithEmail = async (req, res) => {
  const userId = await registerWithEmailService(req.body, req.isMobile);

  res.status(201).json(
    new ApiResponse(201, "User registered successfully", {
      step: "OTP",
      userId,
    }),
  );
};

// login user
export const loginWithEmail = async (req, res) => {
  const result = await loginWithEmailService(req);

  // temp: disable for the mobile devices
  if (!req.isMobile) {
    if (result.step === "2FA") {
      return res.status(200).json(
        new ApiResponse(200, "Verify 2FA", {
          isEnabled2Fa: true,
          ...result.data,
        }),
      );
    }
  }

  if (result.step === "OTP") {
    return res.status(200).json(
      new ApiResponse(200, "Verify OTP", {
        is_verfiy_otp: true,
        userId: result.userId,
      }),
    );
  }

  if (!req.isMobile) {
    res.cookie("sessionId", result.sessionId, SESSION_OPTIONS);
  }

  res.status(200).json(
    new ApiResponse(200, "Login successful", {
      showSetUp2Fa: result.showSetUp2Fa,
      sessionId: req.isMobile ? result.sessionId : undefined,
    }),
  );
};

// get user
export const getCureentUser = async (req, res) => {
  const directory = await singleFindDirectory(
    req.user.rootDirId,
    {
      metaData: 1,
    },
    {
      path: "userId",
      select: "id name email picture role maxStorageBytes uploadLimit",
    },
  );
  // When user session are the store on the redis than it delete
  if (!directory?.userId && req.user._id) {
    await deleteRedisKey(`user:${req.user._id.toString()}`);
    throw new ApiError(401, "User need to re Authenticated.");
  }
  const user = directory.userId;
  let avatarUrl = user.picture;
  if (!user.picture.startsWith("http")) {
    avatarUrl = await getSignedUrlForGetObject(
      directory.userId.picture,
      "my_avatar.png",
      false,
      AVATAR_UPLOAD_FOLDER,
      8640 * 7,
    );
    user.picture = avatarUrl;
  }
  res.status(200).json(
    new ApiResponse(200, "User login Successfuly", {
      picture: avatarUrl,
      ...user,
      totalUsedBytes: directory?.metaData?.size,
      rootDirId: directory._id,
    }),
  );
};

export const getUseStorage = async (req, res) => {
  const directory = await singleFindDirectory(req.user.rootDirId, {
    metaData: 1,
  });
  res.status(200).json(
    new ApiResponse(200, "User login Successfuly", {
      size: directory.metaData.size,
    }),
  );
};

// logout user
export const logout = async (req, res) => {
  let sessionId;
  if (req.isMobile) {
    sessionId = req.headers.token;
  } else {
    sessionId = req.signedCookies?.sessionId;
  }
  const userId = req.user._id.toString();
  await deleteSingleUserSession({
    userId,
    sessionId,
  });
  res.clearCookie("sessionId", CLEAR_COOKIE_OPTIONS);
  res.status(200).json(new ApiResponse(200, "User logout Successfuly"));
};

// logout all devices
export const logoutAllDevices = async (req, res) => {
  await deleteAllUserSessions(req.user._id);
  res
    .status(200)
    .json(new ApiResponse(200, "User logout for all devices Successfuly"));
};

// login with google
export const loginWithGoogle = async (req, res) => {
  const { idToken } = req.body;

  const { email, picture, name, sub } = await googleIdTokenVerify(idToken);

  const exstingEmail = await getOneAuthIdentity({
    providerId: sub,
    provider: "GOOGLE",
  });
  console.log("run on the google");
  let userId;
  let showSetUp2Fa;
  if (exstingEmail) {
    // direct login
    if (exstingEmail.userId?.isDeleted) {
      return res
        .status(409)
        .json(
          new ApiError(409, "Your Account is Deleted. Please Contact Admin"),
        );
    }
    userId = exstingEmail.userId._id;
    // TEMP: disable for the mobile
    if (!req.isMobile) {
      // verifiy 2FA
      if (exstingEmail.userId?.twoFactorId?.isEnabled) {
        showSetUp2Fa = false;
        const twoFa = exstingEmail.userId?.twoFactorId;
        // do not gen a token just send which method to verify
        return res.status(200).json(
          new ApiResponse(200, "verify 2FA ", {
            isEnabled2Fa: true,
            isTotp: twoFa.totp?.isVerified === true ? true : false,
            isPasskey: twoFa.passkeys?.length !== 0 ? true : false,
            userId,
          }),
        );
      }
    }
  } else {
    //  in the here register a new user.
    showSetUp2Fa = true;
    const normalizedEmail = email.toLowerCase().trim();

    userId = await createNewUser(
      {
        name,
        email: normalizedEmail,
        picture,
      },
      sub,
      "GOOGLE",
    );
  }
  console.log("user id " + userId);
  if (!userId) {
    return res.status(400).json(new ApiError(400, "Try Agin"));
  }

  const sessionId = await createAndCheckLimitSession({
    req,
    userId: userId.toString(),
  });

  if (!req.isMobile) {
    res.cookie("sessionId", sessionId, SESSION_OPTIONS);
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      "User login Successfuly . and you can set the optionality to the 2 FA auth",
      {
        showSetUp2Fa,
        sessionId: req.isMobile ? sessionId : undefined,
      },
    ),
  );
};

// login with github
export const loginWithGithub = async (req, res) => {
  const { hint = "LOGIN", userId = null } = req.body;
  // for support both login and link account
  const redirectUrl =
    hint === "LINK"
      ? `${process.env.BACKEND_URL}/auth/github/link?userId=${userId}`
      : process.env.GITHUB_REDIRECT_URI;

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        "Link create",
        `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${redirectUrl}&scope=user:email`,
      ),
    );
};

// callback github
export const callbackGithub = async (req, res) => {
  const query = req.query;

  if (!query?.code) {
    return res.redirect(
      `${process.env.FRONTEND_URL}/auth/github?error=${query?.error}&error_description=${query?.error_description}`,
    );
  }

  const { providerId, accessToken, name, picture } = await getGithubUserDetails(
    query.code,
  );

  const exstingEmail = await getOneAuthIdentity({
    providerId,
    provider: "GITHUB",
  });

  let showSetUp2Fa;
  let queryParms;
  let userId;

  try {
    if (exstingEmail) {
      showSetUp2Fa = false;
      // direct login
      if (exstingEmail.userId?.isDeleted) {
        const errorMessge = "Account is Deleted";
        return res.redirect(
          `${process.env.FRONTEND_URL}/auth/github?error=${errorMessge}error_description=Your Account is Deleted. Please Contact Admin`,
        );
      }
      userId = exstingEmail.userId._id;
      // verifiy 2FA
      if (exstingEmail.userId?.twoFactorId?.isEnabled) {
        userId = exstingEmail.userId._id;

        const twoFa = exstingEmail.userId?.twoFactorId;

        return res.redirect(
          `${process.env.FRONTEND_URL}/auth/github?isEnabled2Fa=${true}&isTotp=${twoFa.totp?.isVerified === true ? true : false}&isPasskey=${twoFa.passkeys?.length !== 0 ? true : false}&userId=${userId}`,
        );
      }
    } else {
      //  in the here register a new user.
      const email = await getGithubUserEmail(accessToken);

      userId = await createNewUser(
        {
          name,
          email,
          picture,
        },
        providerId,
        "GITHUB",
      );
      if (!userId) {
        return res.status(400).json(new ApiError(400, "Try Agin"));
      }
    }

    const sessionId = await createAndCheckLimitSession({
      userId: userId.toString(),
      req,
    });

    res.cookie("sessionId", sessionId, SESSION_OPTIONS);
    queryParms = `showSetUp2Fa=${showSetUp2Fa}`;
  } catch (error) {
    queryParms = "error=something want wrong Try agin";
  } finally {
    res.redirect(`${process.env.FRONTEND_URL}/auth/github?${queryParms}`);
  }

  // process.env.FRONTEND_URL + "/github/session?sessionId=" + session.id,
};

// login with github for the set cookie
export const githubCookieSet = async (req, res) => {
  const { sessionId } = req.query;
  res.cookie("sessionId", sessionId, SESSION_OPTIONS);
  res.redirect(process.env.FRONTEND_URL);
};

// verify the otp
export const verfiyOtp = async (req, res) => {
  const { otp, userId } = req.body;

  await verifyMailOTP(userId, otp);

  const user = await User.findById(userId);
  const result = await twoFaOnBoarding(req, user);

  if (!req.isMobile) {
    res.cookie("sessionId", result.sessionId, SESSION_OPTIONS);
  }

  res.status(200).json(
    new ApiResponse(200, "User login Successfuly", {
      showSetUp2Fa: true,
      userId,
      sessionId: req.isMobile ? result.sessionId : undefined,
    }),
  );
};

// re-send otp
export const reSendOtp = async (req, res) => {
  const { userId } = req.body;
  // delete exsting user Otp
  await sendOtpToMail(userId);

  res.status(200).json(
    new ApiResponse(200, "OTP resend successfully", {
      is_verfiy_otp: true,
      userId: userId,
    }),
  );
};

export const connectWithGoogle = async (req, res) => {
  const userId = req.user._id;
  const { idToken } = req.body;

  const { email, sub } = await googleIdTokenVerify(idToken);
  await exstingAuthIdentity({
    providerId: sub,
    provider: "GOOGLE",
  });

  await createAuthIdentity({
    userId,
    provider: "GOOGLE",
    providerEmail: email.toLowerCase().trim(),
    providerId: sub,
  });

  res
    .status(201)
    .json(new ApiResponse(201, "SuccessFully Link Google Account"));
};

export const connectWithGithub = async (req, res) => {
  const { code } = req.query;

  const { providerId, accessToken } = await getGithubUserDetails(code);

  await exstingAuthIdentity(
    {
      providerId,
      provider: "GITHUB",
    },
    "This email alredy link to anothr account. try other account",
  );

  const providerEmail = await getGithubUserEmail(accessToken);

  await createAuthIdentity({
    userId,
    provider: "GITHUB",
    providerEmail,
    providerId,
  });
  res
    .status(201)
    .json(new ApiResponse(201, "SuccessFully Link Github Account"));
};

export const connectWithEmail = async (req, res) => {
  const { email } = req.body;
  const userId = req.user._id;

  await exstingAuthIdentity(
    {
      providerId: email.toLowerCase().trim(),
    },
    "This email alredy link to anothr account. try other account",
  );

  await sendOtpToMail(userId.toString());
  return res.status(200).json(
    new ApiResponse(200, "Verify the opt", {
      is_verfiy_otp: true,
      userId: userId,
    }),
  );
};

export const connectWithEmailVerifyOtp = async (req, res) => {
  const { otp, userId } = req.body;

  await verifyMailOTP(userId, otp);
  res.status(201).json(new ApiResponse(201, "SuccessFully Link Email Account"));
};

/**
 * link account
 */

export const connectAccountWithGoogle = async (req, res) => {
  await accConnectGoogle(req.user, req.body.idToken);
  res.status(201).json(new ApiResponse(200, "Account Link Successfully"));
};

export const connectAccountWithEmail = async (req, res) => {
  const result = await accConnectEmail(req.user, req.body);
  res
    .status(201)
    .json(new ApiResponse(200, "Account Link Successfully", result));
};

export const emailAccountVerifyByOtp = async (req, res) => {
  await verifyAccConnectOtp(req.user, req.body);
  res.status(201).json(new ApiResponse(200, "Account Link Successfully"));
};

export const disConnectAccount = async (req, res) => {
  await disConnectLinkAccount(req.params.id);
  res.status(200).json(new ApiResponse(200, "Account UnLink Successfully"));
};

export const deleteSession = async (req, res) => {
  const sessionId = req.params?.id;
  console.log(sessionId);
  const userId = req.user._id.toString();
  if (sessionId) {
    await deleteSingleUserSession({
      userId,
      sessionId,
    });
  } else {
    let sessionId;
    if (req.isMobile) {
      sessionId = req.headers.token;
    } else {
      sessionId = req.signedCookies?.sessionId;
    }
    console.log({ userId, sessionId });

    await deleteAllUserSessions(userId, sessionId);
  }
  res.status(200).json(new ApiResponse(200, "Success Logout"));
};

export const authTokenCreate = async (req, res) => {
  const token = new mongoose.Types.ObjectId();
  const key = `linkToken:${token}`;

  await setRedisValue(key, JSON.stringify({ status: "pending" }), {
    expiration: { type: "EX", value: 120 }, // 2 minutes
  });

  res.status(200).json(new ApiResponse(200, "Token created", { token }));
};

export const authTokenVerify = async (req, res) => {
  const { id } = req.params;
  const key = `linkToken:${id}`;

  const data = await getRedisValue(key);
  if (!data) {
    throw new ApiError(404, "Token expired or invalid");
  }

  const tokenData = JSON.parse(data);

  if (tokenData.status === "verified") {
    return res.status(200).json(new ApiResponse(200, "Already verified"));
  }

  await setRedisValue(
    key,
    JSON.stringify({ status: "verified", userId: req.user._id }),
    {
      expiration: { type: "EX", value: 300 },
    },
  );

  res.status(200).json(new ApiResponse(200, "Token verified"));
};

export const authTokenCheck = async (req, res) => {
  const { id } = req.params;
  const key = `linkToken:${id}`;

  const data = await getRedisValue(key);
  if (!data) {
    throw new ApiError(404, "Token expired or invalid");
  }

  const tokenData = JSON.parse(data);

  if (tokenData.status === "pending") {
    return res
      .status(200)
      .json(new ApiResponse(200, "Pending", { status: "pending" }));
  }

  if (tokenData.status === "verified") {
    const sessionId = await createAndCheckLimitSession({
      userId: tokenData.userId,
      req,
    });

    res.cookie("sessionId", sessionId, SESSION_OPTIONS);

    await deleteRedisKey(key);

    return res.status(200).json(
      new ApiResponse(200, "Verified", {
        status: "verified",
      }),
    );
  }
};
