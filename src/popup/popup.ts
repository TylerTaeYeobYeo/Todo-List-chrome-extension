console.log("Popup script running");

const button = document.getElementById("click-me");
if (button) {
    button.addEventListener("click", () => {
        alert("Button clicked!");
    });
}
