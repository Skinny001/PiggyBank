import { ethers } from "hardhat";

async function main(): Promise<void> {
  console.log("Deploying PiggyBank Factory...");

  // Deploy the PiggyBankFactory contract
  const PiggyBankFactory = await ethers.getContractFactory("PiggyBankFactory");
  const factory = await PiggyBankFactory.deploy();
  
  await factory.deployed();
  
  console.log("PiggyBankFactory deployed to:", factory.address);
  console.log("PiggyBank implementation deployed to:", await factory.implementation());
  console.log("Developer address set to:", await factory.developer());

  // For testing: Create a sample PiggyBank
  const tx = await factory.createPiggyBank("Test Saving", 90);
  const receipt = await tx.wait();
  
  // Find the PiggyBankCreated event
  const event = receipt.events?.find(e => e.event === "PiggyBankCreated");
  
  if (event && event.args) {
    const piggyBankAddress = event.args.piggyBank;
    
    console.log("Sample PiggyBank created at:", piggyBankAddress);
    console.log("Saving purpose:", "Test Saving");
    console.log("Duration: 90 days");
  } else {
    console.log("Failed to find PiggyBankCreated event");
  }
}

// Execute the deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });