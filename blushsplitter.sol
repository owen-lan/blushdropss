// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IMerkleDistributor {
    function claim(uint256 index, address account, uint256 amount, bytes32[] calldata merkleProof) external;
}

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}

contract BlushSplitter {
    address public owner;
    uint256 public splitBps = 3000;

    address public constant UNI_DISTRIBUTOR = 0x090D4613473dEE047c3f2706764f49E0821D256e; // ✅ FIXED
    address public constant UNI_TOKEN       = 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984;

    event ClaimAndSplit(address indexed user, uint256 amount, uint256 fee);

    constructor() {
        owner = msg.sender;
    }

    function claimAndSplit(
        uint256 index,
        address account,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external {
        require(account == msg.sender, "Only you can claim your own UNI");

        IMerkleDistributor(UNI_DISTRIBUTOR).claim(index, account, amount, merkleProof);

        uint256 fee = (amount * splitBps) / 10000;
        uint256 toUser = amount - fee;

        IERC20(UNI_TOKEN).transfer(msg.sender, toUser);
        IERC20(UNI_TOKEN).transfer(owner, fee);

        emit ClaimAndSplit(msg.sender, amount, fee);
    }

    function withdrawETH() external {
        require(msg.sender == owner);
        (bool ok, ) = payable(owner).call{value: address(this).balance}("");
        require(ok, "Transfer failed");
    }

    function setFee(uint256 newFeeBps) external {
        require(msg.sender == owner);
        splitBps = newFeeBps;
    }
}