// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./PiggyBank.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PiggyBankFactory
 * @notice Factory contract for creating new PiggyBank instances
 */
contract PiggyBankFactory is Ownable {
    address public implementation;
    address public developer;
    address[] public allPiggyBanks;
    mapping(address => address[]) public userPiggyBanks;

    event PiggyBankCreated(address indexed owner, address piggyBank, string purpose);

    constructor() Ownable(msg.sender) { // Fix for Ownable constructor
        implementation = address(new PiggyBank());
        developer = msg.sender;
    }

    /**
     * @notice Create a new PiggyBank using CREATE2
     */
    function createPiggyBankWithCreate2(
        string memory _purpose,
        uint256 _durationInDays,
        bytes32 _salt
    ) external returns (address) {
        address piggyBank = Clones.cloneDeterministic(implementation, _salt);
        PiggyBank(piggyBank).initialize(_purpose, _durationInDays, developer, msg.sender);

        allPiggyBanks.push(piggyBank);
        userPiggyBanks[msg.sender].push(piggyBank);

        emit PiggyBankCreated(msg.sender, piggyBank, _purpose);
        return piggyBank;
    }

    /**
     * @notice Create a new PiggyBank using standard cloning
     */
    function createPiggyBank(
        string memory _purpose,
        uint256 _durationInDays
    ) external returns (address) {
        address piggyBank = Clones.clone(implementation);
        PiggyBank(piggyBank).initialize(_purpose, _durationInDays, developer, msg.sender);

        allPiggyBanks.push(piggyBank);
        userPiggyBanks[msg.sender].push(piggyBank);

        emit PiggyBankCreated(msg.sender, piggyBank, _purpose);
        return piggyBank;
    }

    /**
     * @notice Predicts the address of a PiggyBank before it's created
     */
    function predictPiggyBankAddress(bytes32 _salt) external view returns (address) {
        return Clones.predictDeterministicAddress(implementation, _salt, address(this));
    }

    /**
     * @notice Gets all PiggyBanks for a specific user
     */
    function getPiggyBanks(address _user) external view returns (address[] memory) {
        return userPiggyBanks[_user];
    }

    /**
     * @notice Returns total number of PiggyBanks created
     */
    function getTotalPiggyBanks() external view returns (uint256) {
        return allPiggyBanks.length;
    }

    /**
     * @notice Updates the developer address
     */
    function setDeveloper(address _newDeveloper) external onlyOwner {
        require(_newDeveloper != address(0), "Invalid developer address");
        developer = _newDeveloper;
    }
}
