// import { expect } from "chai";
// import { ethers } from "hardhat";
// import { time } from "@nomicfoundation/hardhat-network-helpers";
// import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
// import { Contract, BigNumber } from "ethers";

// describe("PiggyBank", function () {
//   let piggyBank: Contract;
//   let owner: SignerWithAddress;
//   let user1: SignerWithAddress;
//   let user2: SignerWithAddress;
//   let DEPOSIT_AMOUNT: BigNumber;

//   beforeEach(async function () {
//     [owner, user1, user2] = await ethers.getSigners();

//     const PiggyBank = await ethers.getContractFactory("PiggyBank");
//     piggyBank = await PiggyBank.deploy();

//     DEPOSIT_AMOUNT = ethers.utils.parseUnits("100", 6); // ✅ Fixed import
//   });

//   it("should allow a user to deposit funds", async function () {
//     await piggyBank.connect(user1).deposit({ value: DEPOSIT_AMOUNT });
//     const balance = await piggyBank.getBalance(user1.address);
//     expect(balance).to.equal(DEPOSIT_AMOUNT);
//   });

//   it("should not allow withdrawal before maturity time", async function () {
//     await piggyBank.connect(user1).deposit({ value: DEPOSIT_AMOUNT });
//     await expect(piggyBank.connect(user1).withdraw()).to.be.revertedWith(
//       "Funds are locked"
//     );
//   });

//   it("should allow withdrawal after maturity time", async function () {
//     await piggyBank.connect(user1).deposit({ value: DEPOSIT_AMOUNT });
//     await time.increase(60 * 60 * 24 * 30); // Increase time by 30 days
//     await piggyBank.connect(user1).withdraw();
//     const balance = await piggyBank.getBalance(user1.address);
//     expect(balance).to.equal(0);
//   });
// });


import { expect } from "chai";
import { ethers, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract } from "ethers";

describe("PiggyBank and Factory Contracts", function () {
  let PiggyBank: any;
  let PiggyBankFactory: any;
  let factory: Contract;
  let piggyBank: Contract;
  let owner: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let developer: HardhatEthersSigner;
  let usdt: Contract;
  let usdc: Contract;
  let dai: Contract;

  // Constants for testing
  const SAVING_PURPOSE: string = "Test Saving";
  const DURATION_DAYS: number = 90;
  const DEPOSIT_AMOUNT = ethers.parseUnits("100", 6); // 100 USDT/USDC (6 decimals)
  const DEPOSIT_AMOUNT_DAI = ethers.parseUnits("100", 18); // 100 DAI (18 decimals)

  beforeEach(async function () {
    // Get signers
    [owner, user1, user2, developer] = await ethers.getSigners();

    // Deploy mock tokens
    const MockToken = await ethers.getContractFactory("MockERC20", owner);
    usdt = await MockToken.deploy("USDT Mock", "USDT", 6);
    await usdt.waitForDeployment();
    
    usdc = await MockToken.deploy("USDC Mock", "USDC", 6);
    await usdc.waitForDeployment();
    
    dai = await MockToken.deploy("DAI Mock", "DAI", 18);
    await dai.waitForDeployment();

    // Deploy PiggyBank contract
    PiggyBank = await ethers.getContractFactory("PiggyBank", owner);
    const piggyBankImpl = await PiggyBank.deploy();
    await piggyBankImpl.waitForDeployment();

    // Deploy factory contract
    PiggyBankFactory = await ethers.getContractFactory("PiggyBankFactory", owner);
    factory = await PiggyBankFactory.deploy(await piggyBankImpl.getAddress());
    await factory.waitForDeployment();

    // Initialize token addresses in the implementation
    await piggyBankImpl.initialize(
      await usdt.getAddress(),
      await usdc.getAddress(),
      await dai.getAddress()
    );
  });

  describe("PiggyBankFactory", function () {
    it("Should deploy the factory and set the developer correctly", async function () {
      expect(await factory.developer()).to.equal(owner.address);
      expect(await factory.implementation()).to.not.equal(ethers.ZeroAddress);
    });

    it("Should create a new PiggyBank with standard method", async function () {
      const tx = await factory.createPiggyBank(SAVING_PURPOSE, DURATION_DAYS);
      const receipt = await tx.wait();
      
      // Find the PiggyBankCreated event
      const eventSignature = "PiggyBankCreated(address,address,string)";
      const eventTopic = ethers.id(eventSignature);
      
      const log = receipt?.logs.find(x => x.topics[0] === eventTopic);
      expect(log).to.not.be.undefined;
      
      // Get piggyBankAddress from event (different parsing required)
      const iface = new ethers.Interface([
        "event PiggyBankCreated(address indexed piggyBank, address indexed creator, string purpose)"
      ]);
      const parsedLog = iface.parseLog(log);
      const piggyBankAddress = parsedLog?.args[0];
      
      // Get the PiggyBank contract
      piggyBank = await ethers.getContractAt("PiggyBank", piggyBankAddress);
      
      // Check if the PiggyBank was initialized correctly
      expect(await piggyBank.getSavingPurpose()).to.equal(SAVING_PURPOSE);
      expect(await piggyBank.owner()).to.equal(owner.address);
      expect(await piggyBank.isActive()).to.equal(true);
      
      // Check that it's tracked in the factory
      expect(await factory.allPiggyBanks(0)).to.equal(piggyBankAddress);
      const userBanks = await factory.getPiggyBanks(owner.address);
      expect(userBanks[0]).to.equal(piggyBankAddress);
    });

    it("Should create a new PiggyBank with CREATE2 method", async function () {
      const salt = ethers.id("test-salt");
      
      // Create the PiggyBank first to get the actual address
      const tx = await factory.createPiggyBankWithCreate2(SAVING_PURPOSE, DURATION_DAYS, salt);
      const receipt = await tx.wait();
      
      // Find the PiggyBankCreated event
      const eventSignature = "PiggyBankCreated(address,address,string)";
      const eventTopic = ethers.id(eventSignature);
      
      const log = receipt?.logs.find(x => x.topics[0] === eventTopic);
      expect(log).to.not.be.undefined;
      
      // Get piggyBankAddress from event
      const iface = new ethers.Interface([
        "event PiggyBankCreated(address indexed piggyBank, address indexed creator, string purpose)"
      ]);
      const parsedLog = iface.parseLog(log);
      const piggyBankAddress = parsedLog?.args[0];
      
      // Now predict the address with the same parameters
      const predictedAddress = await factory.predictPiggyBankAddress(salt);
      
      // Check if the address matches the prediction
      expect(piggyBankAddress).to.equal(predictedAddress);
      
      // Get the PiggyBank contract
      piggyBank = await ethers.getContractAt("PiggyBank", piggyBankAddress);
      
      // Check if the PiggyBank was initialized correctly
      expect(await piggyBank.getSavingPurpose()).to.equal(SAVING_PURPOSE);
    });

    it("Should allow setting a new developer address", async function () {
      await factory.setDeveloper(developer.address);
      expect(await factory.developer()).to.equal(developer.address);
    });
  });

  describe("PiggyBank", function () {
    beforeEach(async function () {
      // Create a new PiggyBank for each test
      const tx = await factory.createPiggyBank(SAVING_PURPOSE, DURATION_DAYS);
      const receipt = await tx.wait();
      
      // Find the PiggyBankCreated event
      const eventSignature = "PiggyBankCreated(address,address,string)";
      const eventTopic = ethers.id(eventSignature);
      
      const log = receipt?.logs.find(x => x.topics[0] === eventTopic);
      
      // Get piggyBankAddress from event
      const iface = new ethers.Interface([
        "event PiggyBankCreated(address indexed piggyBank, address indexed creator, string purpose)"
      ]);
      const parsedLog = iface.parseLog(log);
      const piggyBankAddress = parsedLog?.args[0];
      
      piggyBank = await ethers.getContractAt("PiggyBank", piggyBankAddress);
    });

    it("Should accept deposits of allowed tokens", async function () {
      // Approve and deposit USDT
      await usdt.approve(await piggyBank.getAddress(), DEPOSIT_AMOUNT);
      await piggyBank.depositToken(await usdt.getAddress(), DEPOSIT_AMOUNT);
      expect(await piggyBank.getTokenBalance(await usdt.getAddress())).to.equal(DEPOSIT_AMOUNT);
      
      // Approve and deposit USDC
      await usdc.approve(await piggyBank.getAddress(), DEPOSIT_AMOUNT);
      await piggyBank.depositToken(await usdc.getAddress(), DEPOSIT_AMOUNT);
      expect(await piggyBank.getTokenBalance(await usdc.getAddress())).to.equal(DEPOSIT_AMOUNT);
      
      // Approve and deposit DAI
      await dai.approve(await piggyBank.getAddress(), DEPOSIT_AMOUNT_DAI);
      await piggyBank.depositToken(await dai.getAddress(), DEPOSIT_AMOUNT_DAI);
      expect(await piggyBank.getTokenBalance(await dai.getAddress())).to.equal(DEPOSIT_AMOUNT_DAI);
    });

    it("Should not allow deposits of non-allowed tokens", async function () {
      // Deploy a new token
      const MockToken = await ethers.getContractFactory("MockERC20", owner);
      const notAllowedToken = await MockToken.deploy("NOT", "NOT", 18);
      await notAllowedToken.waitForDeployment();
      
      // Mint tokens to owner
      await notAllowedToken.mint(owner.address, DEPOSIT_AMOUNT_DAI);
      
      // Approve and try to deposit
      await notAllowedToken.approve(await piggyBank.getAddress(), DEPOSIT_AMOUNT_DAI);
      await expect(
        piggyBank.depositToken(await notAllowedToken.getAddress(), DEPOSIT_AMOUNT_DAI)
      ).to.be.revertedWith("Token not allowed");
    });

    it("Should allow withdrawal after duration with no penalty", async function () {
      // Deposit USDT
      await usdt.approve(await piggyBank.getAddress(), DEPOSIT_AMOUNT);
      await piggyBank.depositToken(await usdt.getAddress(), DEPOSIT_AMOUNT);
      
      // Fast forward time to after the duration
      await time.increase(DURATION_DAYS * 24 * 60 * 60 + 1);
      
      // Check if saving is complete
      expect(await piggyBank.isSavingComplete()).to.equal(true);
      
      // Withdraw USDT
      const balanceBefore = await usdt.balanceOf(owner.address);
      await piggyBank.withdrawToken(await usdt.getAddress(), DEPOSIT_AMOUNT);
      const balanceAfter = await usdt.balanceOf(owner.address);
      
      // Check if full amount was received (no penalty)
      expect(balanceAfter - balanceBefore).to.equal(DEPOSIT_AMOUNT);
      
      // Check if PiggyBank is now inactive
      expect(await piggyBank.isActive()).to.equal(false);
    });

    it("Should apply penalty for early withdrawal", async function () {
      // Deposit USDT
      await usdt.approve(await piggyBank.getAddress(), DEPOSIT_AMOUNT);
      await piggyBank.depositToken(await usdt.getAddress(), DEPOSIT_AMOUNT);
      
      // Check if saving is not complete yet
      expect(await piggyBank.isSavingComplete()).to.equal(false);
      
      // Withdraw USDT early
      const balanceBefore = await usdt.balanceOf(owner.address);
      await piggyBank.withdrawToken(await usdt.getAddress(), DEPOSIT_AMOUNT);
      const balanceAfter = await usdt.balanceOf(owner.address);
      
      // Calculate expected penalty
      const penalty = DEPOSIT_AMOUNT * 15n / 100n;
      const expectedAmount = DEPOSIT_AMOUNT - penalty;
      
      // Check if correct amount was received (with penalty)
      expect(balanceAfter - balanceBefore).to.equal(expectedAmount);
      
      // Check if PiggyBank is now inactive
      expect(await piggyBank.isActive()).to.equal(false);
    });

    it("Should not allow deposits after withdrawal", async function () {
      // Deposit and withdraw USDT
      await usdt.approve(await piggyBank.getAddress(), DEPOSIT_AMOUNT * 2n);
      await piggyBank.depositToken(await usdt.getAddress(), DEPOSIT_AMOUNT);
      await piggyBank.withdrawToken(await usdt.getAddress(), DEPOSIT_AMOUNT);
      
      // Try to deposit again
      await expect(
        piggyBank.depositToken(await usdt.getAddress(), DEPOSIT_AMOUNT)
      ).to.be.revertedWith("PiggyBank is no longer active");
    });

    it("Should not allow withdrawal if not owner", async function () {
      // Deposit USDT
      await usdt.approve(await piggyBank.getAddress(), DEPOSIT_AMOUNT);
      await piggyBank.depositToken(await usdt.getAddress(), DEPOSIT_AMOUNT);
      
      // Try to withdraw as user1
      await expect(
        piggyBank.connect(user1).withdrawToken(await usdt.getAddress(), DEPOSIT_AMOUNT)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should calculate timeUntilMaturity correctly", async function () {
      // Get initial time until maturity
      const initialTime = await piggyBank.getTimeUntilMaturity();
      expect(initialTime).to.be.closeTo(
        BigInt(DURATION_DAYS * 24 * 60 * 60),
        60n // Allow for slight differences due to block time
      );
      
      // Fast forward half the time
      await time.increase(DURATION_DAYS * 24 * 60 * 60 / 2);
      
      // Check time again
      const halfwayTime = await piggyBank.getTimeUntilMaturity();
      expect(halfwayTime).to.be.closeTo(
        BigInt(DURATION_DAYS * 24 * 60 * 60 / 2),
        60n // Allow for slight differences
      );
      
      // Fast forward past the duration
      await time.increase(DURATION_DAYS * 24 * 60 * 60);
      
      // Check time again
      const finalTime = await piggyBank.getTimeUntilMaturity();
      expect(finalTime).to.equal(0n);
    });
  });

  describe("Integration Tests", function () {
    it("Should allow creating multiple PiggyBanks for different purposes", async function () {
      // Create first PiggyBank
      await factory.createPiggyBank("Vacation", 30);
      
      // Create second PiggyBank
      await factory.createPiggyBank("House", 365);
      
      // Get user's PiggyBanks
      const userBanks = await factory.getPiggyBanks(owner.address);
      expect(userBanks.length).to.equal(2);
      
      // Check total PiggyBanks
      expect(await factory.getTotalPiggyBanks()).to.equal(2);
      
      // Check first PiggyBank purpose
      const piggyBank1 = await ethers.getContractAt("PiggyBank", userBanks[0]);
      expect(await piggyBank1.getSavingPurpose()).to.equal("Vacation");
      
      // Check second PiggyBank purpose
      const piggyBank2 = await ethers.getContractAt("PiggyBank", userBanks[1]);
      expect(await piggyBank2.getSavingPurpose()).to.equal("House");
    });

    it("Should track PiggyBanks for different users", async function () {
      // Create PiggyBank for owner
      await factory.createPiggyBank("Owner Savings", 30);
      
      // Create PiggyBank for user1
      await factory.connect(user1).createPiggyBank("User1 Savings", 60);
      
      // Get owner's PiggyBanks
      const ownerBanks = await factory.getPiggyBanks(owner.address);
      expect(ownerBanks.length).to.equal(1);
      
      // Get user1's PiggyBanks
      const user1Banks = await factory.getPiggyBanks(user1.address);
      expect(user1Banks.length).to.equal(1);
      
      // Check total PiggyBanks
      expect(await factory.getTotalPiggyBanks()).to.equal(2);
    });
  });
});