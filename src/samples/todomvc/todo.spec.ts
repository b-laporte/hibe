import { TodoApp, Todo, createTodo, toggleCompletion, deleteTodo, clearCompleted, toggleAllCompleted, setFilter, startEditing, stopEditing } from './todo';
import * as assert from 'assert';
import { watch, mutationComplete, isMutating } from '../../hibe';

describe('Todo Service', () => {

    it('should support all exposed services', async function () {
        // note: the following tests should run in sequence in order to share the same todoApp instance
        // and simulate a user's behavior...
        let todoApp = new TodoApp(), renderedData;

        watch(todoApp, (app: TodoApp) => {
            todoApp = app || todoApp;
            render(todoApp);
        });

        function render(app: TodoApp) {
            renderedData = {
                newEntry: app.newEntry, // value of the new entry field
                itemsLeft: app.itemsLeft, // nbr of items to be completed
                filter: app.filter, // current selected filter
                list: []
            }
            for (let i = 0, len = app.listView.length; len > i; i++) {
                let itm = app.listView[i]!;
                renderedData.list.push({
                    completed: itm.completed,
                    todo: itm.description,
                    inEdition: itm.editing
                });
            }
        }
        render(todoApp);

        // ------------------------------------------------------------------------
        assert.deepEqual(renderedData, {
            newEntry: "", itemsLeft: 0, filter: "ALL",
            list: []
        }, "todo view is initially empty");

        todoApp.newEntry = "first todo";
        createTodo(todoApp);

        await mutationComplete(todoApp);
        assert.deepEqual(renderedData, {
            newEntry: "", itemsLeft: 1, filter: "ALL", list: [
                { todo: "first todo", inEdition: false, completed: false }
            ]
        }, "first todo added");

        todoApp.newEntry = "   ";
        createTodo(todoApp);
        await mutationComplete(todoApp);
        assert.deepEqual(renderedData, {
            newEntry: "", itemsLeft: 1, filter: "ALL",
            list: [
                { todo: "first todo", inEdition: false, completed: false }
            ]
        }, "no change when newEntry contains blank spaces");

        todoApp.newEntry = "second todo";
        createTodo(todoApp);
        await mutationComplete(todoApp);
        assert.deepEqual(renderedData, {
            newEntry: "", itemsLeft: 2, filter: "ALL",
            list: [
                { todo: "first todo", inEdition: false, completed: false },
                { todo: "second todo", inEdition: false, completed: false }
            ]
        }, "second todo added");

        // ------------------------------------------------------------------------
        toggleCompletion(todoApp.listView[1]!);
        await mutationComplete(todoApp);
        assert.deepEqual(renderedData, {
            newEntry: "", itemsLeft: 1, filter: "ALL",
            list: [
                { todo: "first todo", inEdition: false, completed: false },
                { todo: "second todo", inEdition: false, completed: true }
            ]
        }, "second todo complete");

        toggleCompletion(todoApp.listView[0]!);
        toggleCompletion(todoApp.listView[1]!);
        await mutationComplete(todoApp);
        assert.deepEqual(renderedData, {
            newEntry: "", itemsLeft: 1, filter: "ALL", list: [
                { todo: "first todo", inEdition: false, completed: true },
                { todo: "second todo", inEdition: false, completed: false }
            ]
        }, "first todo complete");

        // ------------------------------------------------------------------------
        deleteTodo(todoApp, todoApp.listView[0]!);
        await mutationComplete(todoApp);
        assert.deepEqual(renderedData, {
            newEntry: "", itemsLeft: 1, filter: "ALL",
            list: [
                { todo: "second todo", inEdition: false, completed: false }
            ]
        }, "first todo deleted");

        deleteTodo(todoApp, todoApp.listView![0]!);
        await mutationComplete(todoApp);
        assert.deepEqual(renderedData, {
            newEntry: "", itemsLeft: 0, filter: "ALL",
            list: []
        }, "second todo deleted");

        // ------------------------------------------------------------------------
        todoApp.newEntry = "todo A";
        createTodo(todoApp);
        todoApp.newEntry = "todo B";
        createTodo(todoApp);
        toggleCompletion(todoApp.listView[0]!);
        await mutationComplete(todoApp);
        assert.deepEqual(renderedData, {
            newEntry: "", itemsLeft: 1, filter: "ALL",
            list: [
                { todo: "todo A", inEdition: false, completed: true },
                { todo: "todo B", inEdition: false, completed: false }
            ]
        }, "init state before clearCompleted");

        clearCompleted(todoApp);
        await mutationComplete(todoApp);
        assert.deepEqual(renderedData, {
            newEntry: "", itemsLeft: 1, filter: "ALL",
            list: [
                { todo: "todo B", inEdition: false, completed: false }
            ]
        }, "todo A cleared");

        // ------------------------------------------------------------------------
        // add 2 more items
        todoApp.newEntry = "todo C";
        createTodo(todoApp);
        todoApp.newEntry = "todo D";
        createTodo(todoApp);
        toggleCompletion(todoApp.listView[1]!);
        await mutationComplete(todoApp);
        assert.deepEqual(renderedData, {
            newEntry: "", itemsLeft: 2, filter: "ALL",
            list: [
                { todo: "todo B", inEdition: false, completed: false },
                { todo: "todo C", inEdition: false, completed: true },
                { todo: "todo D", inEdition: false, completed: false }
            ]
        }, "init state before toggleAllCompleted");

        toggleAllCompleted(todoApp);
        await mutationComplete(todoApp);
        assert.deepEqual(renderedData, {
            newEntry: "", itemsLeft: 0, filter: "ALL",
            list: [
                { todo: "todo B", inEdition: false, completed: true },
                { todo: "todo C", inEdition: false, completed: true },
                { todo: "todo D", inEdition: false, completed: true }
            ]
        }, "all completed");

        toggleAllCompleted(todoApp);
        await mutationComplete(todoApp);
        assert.deepEqual(renderedData, {
            newEntry: "", itemsLeft: 3, filter: "ALL",
            list: [
                { todo: "todo B", inEdition: false, completed: false },
                { todo: "todo C", inEdition: false, completed: false },
                { todo: "todo D", inEdition: false, completed: false }
            ]
        }, "none completed");

        // ------------------------------------------------------------------------
        toggleCompletion(todoApp.listView[1]!);
        await mutationComplete(todoApp);
        assert.deepEqual(renderedData, {
            newEntry: "", itemsLeft: 2, filter: "ALL",
            list: [
                { todo: "todo B", inEdition: false, completed: false },
                { todo: "todo C", inEdition: false, completed: true },
                { todo: "todo D", inEdition: false, completed: false }
            ]
        }, "init state before setFilter");

        setFilter(todoApp, "COMPLETED");
        await mutationComplete(todoApp);
        assert.deepEqual(renderedData, {
            newEntry: "", itemsLeft: 2, filter: "COMPLETED",
            list: [
                { todo: "todo C", inEdition: false, completed: true }
            ]
        }, "completed only");

        setFilter(todoApp, "ACTIVE");
        await mutationComplete(todoApp);
        assert.deepEqual(renderedData, {
            newEntry: "", itemsLeft: 2, filter: "ACTIVE",
            list: [
                { todo: "todo B", inEdition: false, completed: false },
                { todo: "todo D", inEdition: false, completed: false }
            ]
        }, "completed only");

        setFilter(todoApp, "ALL");
        await mutationComplete(todoApp);
        assert.deepEqual(renderedData, {
            newEntry: "", itemsLeft: 2, filter: "ALL",
            list: [
                { todo: "todo B", inEdition: false, completed: false },
                { todo: "todo C", inEdition: false, completed: true },
                { todo: "todo D", inEdition: false, completed: false }
            ]
        }, "back to init state after setFilter");

        // ------------------------------------------------------------------------
        startEditing(todoApp, todoApp.listView[1]);
        await mutationComplete(todoApp);
        assert.deepEqual(renderedData, {
            newEntry: "", itemsLeft: 2, filter: "ALL",
            list: [
                { todo: "todo B", inEdition: false, completed: false },
                { todo: "todo C", inEdition: true, completed: true },
                { todo: "todo D", inEdition: false, completed: false }
            ]
        }, "item C editing");

        startEditing(todoApp, todoApp.listView[0]);
        await mutationComplete(todoApp);
        assert.deepEqual(renderedData, {
            newEntry: "", itemsLeft: 2, filter: "ALL",
            list: [
                { todo: "todo B", inEdition: true, completed: false },
                { todo: "todo C", inEdition: false, completed: true },
                { todo: "todo D", inEdition: false, completed: false }
            ]
        }, "item B editing");

        stopEditing(todoApp.listView[0]);
        await mutationComplete(todoApp);
        assert.deepEqual(renderedData, {
            newEntry: "", itemsLeft: 2, filter: "ALL",
            list: [
                { todo: "todo B", inEdition: false, completed: false },
                { todo: "todo C", inEdition: false, completed: true },
                { todo: "todo D", inEdition: false, completed: false }
            ]
        }, "no more editing");
    });

});