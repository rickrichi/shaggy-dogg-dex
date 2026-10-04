const base = require('./electron-builder.json');
if (!process.env.WIN_CSC_SHA1 || !/^[a-fA-F0-9]{40}$/.test(process.env.WIN_CSC_SHA1)) {
  throw new Error('Set WIN_CSC_SHA1 to the trusted code-signing certificate thumbprint.');
}
module.exports = {
  ...base,
  forceCodeSigning: true,
  directories: { ...base.directories, output: 'release/signed' },
  win: { ...base.win, signAndEditExecutable: true, signtoolOptions: {
    certificateSha1: process.env.WIN_CSC_SHA1,
    signingHashAlgorithms: ['sha256'],
    rfc3161TimeStampServer: 'http://timestamp.digicert.com',
  } },
};
