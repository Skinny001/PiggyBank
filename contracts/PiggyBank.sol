// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PiggyBank
 * @notice A contract that allows users to save funds for a fixed duration
 */
contract PiggyBank is Ownable {
    string public savingPurpose;
    uint256 public savingDuration;
    uint256 public creationTime;
    address public developer;
    bool public isActive;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event PenaltyPaid(address indexed user, uint256 amount);

    modifier onlyWhenActive() {
        require(isActive, "PiggyBank is not active");
        _;
    }

    constructor() Ownable(msg.sender) {} // Fix for Ownable constructor

    /**
     * @notice Initializes the PiggyBank (for use with Clones)
     * @param _purpose The saving goal description
     * @param _durationInDays Number of days before withdrawal is allowed
     * @param _developer Address that receives penalties
     * @param _owner The owner of this PiggyBank
     */
    function initialize(
        string memory _purpose,
        uint256 _durationInDays,
        address _developer,
        address _owner
    ) external {
        require(bytes(savingPurpose).length == 0, "Already initialized");
        
        savingPurpose = _purpose;
        savingDuration = _durationInDays * 1 days;
        creationTime = block.timestamp;
        developer = _developer;
        isActive = true;

        _transferOwnership(_owner); // Assign correct owner
    }

    /**
     * @notice Deposits funds into the PiggyBank
     */
    function deposit() external payable onlyWhenActive {
        require(msg.value > 0, "Deposit must be greater than zero");
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice Withdraws funds when the saving period is over
     */
    function withdraw() external onlyOwner onlyWhenActive {
        require(block.timestamp >= creationTime + savingDuration, "Saving period not yet over");
        
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");

        isActive = false;
        payable(owner()).transfer(balance);
        emit Withdrawn(owner(), balance);
    }

    /**
     * @notice Allows early withdrawal with a penalty fee
     */
    function earlyWithdraw() external onlyOwner onlyWhenActive {
        require(block.timestamp < creationTime + savingDuration, "Use normal withdraw");

        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");

        uint256 penalty = (balance * 10) / 100; // 10% penalty
        uint256 remaining = balance - penalty;

        isActive = false;
        payable(developer).transfer(penalty);
        payable(owner()).transfer(remaining);

        emit PenaltyPaid(owner(), penalty);
        emit Withdrawn(owner(), remaining);
    }

    /**
     * @notice Check contract balance
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
