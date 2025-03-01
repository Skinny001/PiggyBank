import { ethers } from "hardhat";

async function main() {
  console.log("Deploying PiggyBank Factory...");

  // Deploy the PiggyBankFactory contract
  const PiggyBankFactory = await ethers.getContractFactory("PiggyBankFactory");
  const factory = await PiggyBankFactory.deploy(); // Deploys the contract

  await factory.waitForDeployment(); // FIX: Replace deployed() with waitForDeployment()

  const factoryAddress = await factory.getAddress(); // Get factory address
  console.log("PiggyBankFactory deployed to:", factoryAddress);
  console.log("PiggyBank implementation deployed to:", await factory.implementation());
  console.log("Developer address set to:", await factory.developer());

  // Create a sample PiggyBank
  const tx = await factory.createPiggyBank("Test Saving", 90);
  const receipt = await tx.wait();

  // Find the PiggyBankCreated event
  const event = receipt.logs.find((log: any) => log.fragment.name === "PiggyBankCreated");
  const piggyBankAddress = event.args.piggyBank;

  console.log("Sample PiggyBank created at:", piggyBankAddress);
  console.log("Saving purpose:", "Test Saving");
  console.log("Duration: 90 days");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
