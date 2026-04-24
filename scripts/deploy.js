const hre = require("hardhat");

async function main() {
  const Escrow = await hre.ethers.getContractFactory("FreelanceEscrowV2");

  console.log("Deploying contract...");

  const escrow = await Escrow.deploy();

  await escrow.waitForDeployment();

  const address = await escrow.getAddress();

  console.log("FreelanceEscrowV2 deployed to:", address);
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});