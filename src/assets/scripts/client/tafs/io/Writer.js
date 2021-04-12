import $ from "jquery";
export default class Writer {
    constructor(app_controller) {
        this.app_controller = app_controller;
    }

    send_command(command) {
        this.app_controller.inputController.$commandInput.val(command);
        this.app_controller.inputController.input.command = command;
        this.app_controller.inputController.processCommand();
    }
}
