"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const indexPath = path.join(root, "index.js");
const cookiePath = path.join(root, "libs", "alexa-cookie", "alexa-cookie.js");

function read(file) {
    return fs.readFileSync(file, "utf8");
}

function write(file, content) {
    fs.writeFileSync(file, content, "utf8");
}

function replaceExactlyOnce(content, pattern, replacement, label) {
    const matches = content.match(pattern);
    if (!matches || matches.length !== 1) {
        throw new Error(`${label}: expected exactly one match, found ${matches ? matches.length : 0}`);
    }
    return content.replace(pattern, replacement);
}

function patchServer() {
    let content = read(indexPath);

    if (!content.includes("Refresh failed; existing authentication retained.")) {
        const routePattern = /            webApp\.get\("\/refreshCookie", urlencodedParser, \(req, res\) => \{[\s\S]*?            \}\);\n            webApp\.get\("\/configData"/g;
        const replacement = `            webApp.get("/refreshCookie", urlencodedParser, (req, res) => {
                logger.verbose("refreshCookie request received");
                const currentCookieData = runTimeData.savedConfig && runTimeData.savedConfig.cookieData;
                if (!currentCookieData) {
                    logger.error("Cookie refresh skipped: no existing cookie data is available.");
                    res.send({ result: "failed", error: "No existing cookie data available." });
                    return;
                }

                // refreshAlexaCookie mutates formerRegistrationData in place. Refresh a clone so a
                // failed Amazon token exchange can never corrupt the last known-good credentials.
                const refreshCandidate = JSON.parse(JSON.stringify(currentCookieData));
                alexaCookie.refreshAlexaCookie(
                    {
                        formerRegistrationData: refreshCandidate,
                    },
                    (err, result) => {
                        if (result && Object.keys(result).length >= 2) {
                            isCookieValid(result).then((valid) => {
                                if (valid) {
                                    runTimeData.savedConfig.cookieData = result;
                                    updSessionItem("cookieData", result);
                                    sendCookiesToEndpoint(configData.settings.appCallbackUrl ? String(configData.settings.appCallbackUrl).replace("/receiveData?", "/cookie?") : null, result);
                                    logger.info("Successfully Refreshed Alexa Cookie...");
                                    res.send({ result: JSON.stringify(result) });
                                } else {
                                    logger.error("Cookie refresh produced invalid credentials.");
                                    logger.warn("Refresh failed; existing authentication retained.");
                                    res.send({ result: "failed", error: "Refreshed cookie failed validation; existing authentication retained." });
                                }
                            });
                        } else {
                            logger.error("Cookie refresh failed: " + ((err && err.message) || "no refreshed credentials returned"));
                            logger.warn("Refresh failed; existing authentication retained.");
                            res.send({ result: "failed", error: "Cookie refresh failed; existing authentication retained." });
                        }
                    },
                );
            });
            webApp.get("/configData"`;
        content = replaceExactlyOnce(content, routePattern, replacement, "manual refresh route");
    }

    if (!content.includes("Scheduled refresh failed; existing authentication retained.")) {
        const scheduledPattern = /                    alexaCookie\.refreshAlexaCookie\([\s\S]*?                    \);\n                \}, REFRESH_INTERVAL_MS\);/g;
        const scheduledReplacement = `                    const currentCookieData = runTimeData.savedConfig.cookieData;
                    const refreshCandidate = JSON.parse(JSON.stringify(currentCookieData));
                    alexaCookie.refreshAlexaCookie(
                        { formerRegistrationData: refreshCandidate },
                        (err, result) => {
                            if (result && Object.keys(result).length >= 2) {
                                isCookieValid(result).then((valid) => {
                                    if (valid) {
                                        runTimeData.savedConfig.cookieData = result;
                                        updSessionItem("cookieData", result);
                                        sendCookiesToEndpoint(configData.settings.appCallbackUrl ? String(configData.settings.appCallbackUrl).replace("/receiveData?", "/cookie?") : null, result);
                                        logger.info("Scheduled cookie refresh completed successfully.");
                                    } else {
                                        logger.error("Scheduled refresh produced invalid credentials.");
                                        logger.warn("Scheduled refresh failed; existing authentication retained.");
                                    }
                                });
                            } else {
                                logger.error("Scheduled refresh failed: " + ((err && err.message) || "no refreshed credentials returned"));
                                logger.warn("Scheduled refresh failed; existing authentication retained.");
                            }
                        }
                    );
                }, REFRESH_INTERVAL_MS);`;
        content = replaceExactlyOnce(content, scheduledPattern, scheduledReplacement, "scheduled refresh block");
    }

    write(indexPath, content);
}

function patchAlexaCookie() {
    let content = read(cookiePath);

    if (!content.includes("Alexa-Cookie: Skip App registration during refresh")) {
        const marker = "    this.refreshAlexaCookie = (__options, callback) => {";
        if (!content.includes(marker)) {
            throw new Error("alexa-cookie refresh marker not found");
        }

        const finishCookieRefresh = `    // Amazon began rejecting /auth/register during refresh in 2026. A refresh should
    // keep the existing device registration and use its refresh token to obtain fresh
    // marketplace cookies instead of trying to register the app again.
    const finishCookieRefresh = (loginData, callback) => {
        _options.logger && _options.logger('Alexa-Cookie: Skip App registration during refresh and update local cookies');
        const amazonPage = loginData.amazonPage || _options.amazonPage || _options.baseAmazonPage;

        getLocalCookies(amazonPage, loginData.refreshToken, (err, localCookie) => {
            if (err) {
                callback && callback(err, null);
                return;
            }

            loginData.localCookie = localCookie;
            getCSRFFromCookies(loginData.localCookie, _options, (err, resData) => {
                if (err) {
                    callback && callback(new Error('Error getting csrf for ' + amazonPage), null);
                    return;
                }
                loginData.localCookie = resData.cookie;
                loginData.csrf = resData.csrf;
                loginData.amazonPage = amazonPage;
                loginData.tokenDate = Date.now();
                delete loginData.accessToken;
                _options.logger && _options.logger('Alexa-Cookie: Refresh finished with updated cookies and csrf');
                callback && callback(null, loginData);
            });
        });
    };

`;
        content = content.replace(marker, finishCookieRefresh + marker);
    }

    const missingReturn = `            getLocalCookies(_options.baseAmazonPage, _options.formerRegistrationData.refreshToken, (err, comCookie) => {
                if (err) {
                    callback && callback(err, null);
                }

                // Restore frc and map-md`;
    const withReturn = `            getLocalCookies(_options.baseAmazonPage, _options.formerRegistrationData.refreshToken, (err, comCookie) => {
                if (err) {
                    callback && callback(err, null);
                    return;
                }

                // Restore frc and map-md`;
    if (content.includes(missingReturn)) {
        content = content.replace(missingReturn, withReturn);
    } else if (!content.includes(withReturn)) {
        throw new Error("alexa-cookie refresh error handling block not found");
    }

    const reRegister = `                _options.formerRegistrationData.loginCookie = newCookie;
                handleTokenRegistration(_options, _options.formerRegistrationData, callback);`;
    const finishRefresh = `                _options.formerRegistrationData.loginCookie = newCookie;
                finishCookieRefresh(_options.formerRegistrationData, callback);`;
    if (content.includes(reRegister)) {
        content = content.replace(reRegister, finishRefresh);
    } else if (!content.includes(finishRefresh)) {
        throw new Error("alexa-cookie re-registration call not found");
    }

    write(cookiePath, content);
}

patchServer();
patchAlexaCookie();
console.log("Applied Echo Speaks 2026 cookie refresh fixes.");
