
import { Dataset, List, string, boolean, dataset, hList, computed } from '../../hibe';

@Dataset
export class Todo {
    @string() description;
    @boolean() completed;
    @boolean() editing;
}

@Dataset
export class TodoApp {
    @string() newEntry;
    @dataset(hList(Todo)) list: List<Todo>;
    @string() filter = "ALL"; // todo: support enum and/or "ALL" | "ACTIVE" | "COMPLETED" 

    @computed() get listView(): Todo[] {
        if (this.filter === "ALL") {
            return this.list.toArray();
        } else {
            let isComplete = (this.filter === "COMPLETED");
            return this.list.filter(item => item.completed === isComplete);
        }
    }

    @computed() get itemsLeft(): number {
        let itemsLeft = 0;
        this.list.forEach(item => {
            itemsLeft += item.completed ? 0 : 1;
        });
        return itemsLeft;
    }
}

// create a new todo from the newEntry field
export function createTodo(app: TodoApp) {
    let todoDesc = app.newEntry.trim();
    if (todoDesc.length) {
        let item = new Todo();
        item.description = todoDesc;
        app.list.push(item);
    }
    app.newEntry = "";
}

export function toggleCompletion(todo: Todo) {
    todo.completed = !todo.completed;
}

export function deleteTodo(app: TodoApp, todo: Todo) {
    const index = app.list.indexOf(todo);
    app.list.splice(index, 1);
}

export function clearCompleted(app: TodoApp) {
    app.list.filterItems((todo) => !todo.completed);
}

// toggle all complete or uncompleted if all items are completed
export function toggleAllCompleted(app: TodoApp) {
    const toBeCompleted = app.list.filter((todo) => !todo.completed).length > 0;
    app.list.forEach((todo) => { todo.completed = toBeCompleted });
}

export function setFilter(app: TodoApp, filter: "ALL" | "ACTIVE" | "COMPLETED") {
    app.filter = filter;
}

// called when an item is clicked
export function startEditing(app: TodoApp, todo: Todo | null) {
    app.list.forEach((item) => {
        item.editing = (item === todo);
    });
}

export function stopEditing(todo: Todo) {
    todo.editing = false;
}
